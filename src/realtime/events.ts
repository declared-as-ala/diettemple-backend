export const REALTIME_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  /** Every connected admin (role "admin"): receives new/updated complaints. */
  admins: 'admins',
} as const;

export const REALTIME_EVENTS = {
  userUpdated: 'user:updated',
  /** A complaint was created or got a new message / status change (payload: { complaintId, kind }). */
  complaintUpdated: 'complaint:updated',
  /** A coach voice/text message about an exercise was sent or deleted (payload: { exerciseId, messageId, kind }). */
  voiceMessage: 'voice:message',
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
