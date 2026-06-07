export const REALTIME_ROOMS = {
  user: (userId: string) => `user:${userId}`,
} as const;

export const REALTIME_EVENTS = {
  userUpdated: 'user:updated',
} as const;

export type SubscriptionStatusRealtime = 'ACTIVE' | 'EXPIRED' | 'CANCELED' | 'NONE';

export interface SafeUserRealtimePayload {
  id: string;
  name: string | null;
  plan: string | null;
  level: string | null;
  badgePhoto: string | null;
  avatar: string | null;
  subscriptionStatus: SubscriptionStatusRealtime;
  updatedAt: string;
}
