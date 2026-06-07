import User from '../models/User.model';
import Subscription from '../models/Subscription.model';
import { getRealtimeServer } from './socket';
import { REALTIME_EVENTS, REALTIME_ROOMS, type SafeUserRealtimePayload } from './events';

function computeSubscriptionStatus(status: string | undefined, endAt: Date | null | undefined): SafeUserRealtimePayload['subscriptionStatus'] {
  if (!status) return 'NONE';
  if (status !== 'ACTIVE') return status as SafeUserRealtimePayload['subscriptionStatus'];
  if (!endAt) return 'ACTIVE';
  return endAt.getTime() >= Date.now() ? 'ACTIVE' : 'EXPIRED';
}

export async function buildSafeRealtimeUserPayload(userId: string): Promise<SafeUserRealtimePayload | null> {
  const [user, subscription] = await Promise.all([
    User.findById(userId).select('_id name level photoUri badgePhoto updatedAt').lean(),
    Subscription.findOne({ userId }).sort({ endAt: -1 }).populate('levelTemplateId', 'name').lean(),
  ]);

  if (!user) return null;

  const sub = subscription as any;
  const subStatus = computeSubscriptionStatus(sub?.status, sub?.endAt ?? null);
  const planName = sub?.levelTemplateId?.name ?? null;

  return {
    id: String((user as any)._id),
    name: (user as any).name ?? null,
    plan: typeof planName === 'string' ? planName : null,
    level: (user as any).level ?? null,
    badgePhoto: (user as any).badgePhoto ?? null,
    avatar: (user as any).photoUri ?? null,
    subscriptionStatus: subStatus,
    updatedAt: new Date((user as any).updatedAt ?? Date.now()).toISOString(),
  };
}

export async function emitUserUpdated(userId: string): Promise<void> {
  const payload = await buildSafeRealtimeUserPayload(userId);
  if (!payload) return;

  const io = getRealtimeServer();
  io.to(REALTIME_ROOMS.user(userId)).emit(REALTIME_EVENTS.userUpdated, payload);
}
