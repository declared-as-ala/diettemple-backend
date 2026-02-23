/**
 * Geofence utility for gym presence verification.
 * Computes distance (meters) between user GPS and nearest gym; optional geofence match.
 * TODO: Load gym locations from DB or config (e.g. GymLocation model); for now uses empty list.
 */

export interface GymLocation {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  /** Optional radius in meters for this gym (overrides global if set). */
  radiusMeters?: number;
}

const GEOFENCE_RADIUS_METERS = parseInt(process.env.GYM_GEOFENCE_RADIUS_METERS || '100', 10) || 100;

/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get nearest gym and distance. Returns null if no gyms configured.
 * TODO: Replace with DB lookup (e.g. GymLocation.find()) or config (GYM_LOCATIONS_JSON).
 */
export function getNearestGym(
  latitude: number,
  longitude: number,
  gyms?: GymLocation[]
): { gym: GymLocation; distanceMeters: number } | null {
  const list = gyms ?? getGymLocations();
  if (!list.length) return null;
  let nearest: GymLocation | null = null;
  let minDist = Infinity;
  for (const gym of list) {
    const d = distanceMeters(latitude, longitude, gym.latitude, gym.longitude);
    if (d < minDist) {
      minDist = d;
      nearest = gym;
    }
  }
  return nearest ? { gym: nearest, distanceMeters: Math.round(minDist * 10) / 10 } : null;
}

/**
 * Get gym locations. Replace with DB/config when available.
 * Optional: GYM_LOCATIONS_JSON='[{"id":"1","latitude":36.8,"longitude":10.2,"name":"Main Gym"}]'
 */
function getGymLocations(): GymLocation[] {
  const raw = process.env.GYM_LOCATIONS_JSON;
  if (!raw || typeof raw !== 'string') return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    return (arr || []).filter(
      (x): x is GymLocation =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as any).latitude === 'number' &&
        typeof (x as any).longitude === 'number'
    );
  } catch {
    return [];
  }
}

export interface GeofenceResult {
  gpsProvided: boolean;
  geofenceMatch: boolean;
  nearestGymDistanceMeters: number | null;
}

export function checkGeofence(
  latitude: number | undefined,
  longitude: number | undefined,
  radiusMeters?: number
): GeofenceResult {
  const radius = radiusMeters ?? GEOFENCE_RADIUS_METERS;
  if (latitude == null || longitude == null) {
    return { gpsProvided: false, geofenceMatch: false, nearestGymDistanceMeters: null };
  }
  const nearest = getNearestGym(latitude, longitude);
  if (!nearest) {
    return {
      gpsProvided: true,
      geofenceMatch: false,
      nearestGymDistanceMeters: null,
    };
  }
  const withinRadius =
    nearest.distanceMeters <= (nearest.gym.radiusMeters ?? radius);
  return {
    gpsProvided: true,
    geofenceMatch: withinRadius,
    nearestGymDistanceMeters: nearest.distanceMeters,
  };
}

export { GEOFENCE_RADIUS_METERS };
