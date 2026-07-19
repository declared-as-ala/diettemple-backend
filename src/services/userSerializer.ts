/**
 * User Serializer Service
 *
 * Purpose: Serializes User objects for API responses with proper backward compatibility
 * - Derives level from assigned plan (source of truth)
 * - Returns legacy level field for mobile app compatibility
 * - Includes optional assignedPlan details
 */

import { IUser } from '../models/User.model';
import { ILevelTemplate } from '../models/LevelTemplate.model';

/**
 * Convert internal level format to backward-compatible display format
 * INITIATE → Initiate, FIGHTER → Fighter, etc.
 */
export function convertToBackCompatLevel(internalLevel: string): string {
  const map: Record<string, string> = {
    'INITIATE': 'Initiate',
    'FIGHTER': 'Fighter',
    'WARRIOR': 'Warrior',
    'CHAMPION': 'Champion',
    'ELITE': 'Elite',
  };
  return map[internalLevel] || 'Initiate';
}

export interface SerializedAssignedPlan {
  id: string;
  name: string;
  level: string;
  levelDisplay: string;
  durationWeeks: number;
  minimumSessionsPerWeek?: number;
  maximumSessionsPerWeek?: number;
  isActive: boolean;
}

export interface SerializedUser {
  _id: string;
  email?: string;
  phone?: string;
  name?: string;
  photoUri?: string;
  sexe?: 'M' | 'F';
  age?: string;
  taille?: string;
  poids?: string;
  objectif?: string;
  role?: string;

  // BACKWARD COMPATIBILITY: Level derived from assigned plan
  level: string;

  // NEW: Full assigned plan details
  assignedPlanId?: string;
  assignedPlan?: SerializedAssignedPlan;

  // Other fields
  biometricEnabled: boolean;
  nutritionTarget?: Record<string, unknown>;
  bodyComposition?: Record<string, unknown>;
  fitnessLevel?: string;
  nutritionGoal?: Record<string, unknown>;
}

/**
 * Serialize user for API response
 * - Derives level from assigned plan
 * - Returns backward-compatible format for mobile app
 * - Includes optional richer plan details
 */
export function serializeUserForAPI(user: IUser): SerializedUser {
  let derivedLevel = user.level || 'Initiate';
  let assignedPlan: SerializedAssignedPlan | undefined;

  // If user has assigned plan, derive level from it
  if (user.assignedPlanId) {
    const plan = user.assignedPlanId as any;

    if (plan && plan.level && typeof plan.level === 'string') {
      // Derive level from plan
      derivedLevel = convertToBackCompatLevel(plan.level);

      // Build plan details
      assignedPlan = {
        id: plan._id?.toString() || '',
        name: plan.name || '',
        level: plan.level,
        levelDisplay: derivedLevel,
        durationWeeks: plan.durationWeeks || 5,
        minimumSessionsPerWeek: plan.minimumSessionsPerWeek,
        maximumSessionsPerWeek: plan.maximumSessionsPerWeek,
        isActive: plan.isActive !== false,
      };
    }
  }

  const serialized: SerializedUser = {
    _id: user._id.toString(),
    email: user.email,
    phone: user.phone,
    name: user.name,
    photoUri: user.photoUri,
    sexe: user.sexe,
    age: user.age,
    taille: user.taille,
    poids: user.poids,
    objectif: user.objectif,
    role: user.role,

    // BACKWARD COMPATIBILITY: Always include level
    level: derivedLevel,

    // NEW: Optional plan details
    assignedPlanId: user.assignedPlanId ? (user.assignedPlanId as any)._id?.toString() : undefined,
    assignedPlan,

    biometricEnabled: user.biometricEnabled || false,
    nutritionTarget: user.nutritionTarget,
    bodyComposition: user.bodyComposition,
    fitnessLevel: user.fitnessLevel,
    nutritionGoal: user.nutritionGoal,
  };

  return serialized;
}

/**
 * Serialize multiple users
 */
export function serializeUsersForAPI(users: IUser[]): SerializedUser[] {
  return users.map(serializeUserForAPI);
}
