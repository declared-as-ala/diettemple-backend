/**
 * Seed subscriptions. Most users on Initiate; mixed ACTIVE / EXPIRED / CANCELED; some expiring soon.
 * Upsert not used (we delete all and recreate). Run after seed:users and seed:levels.
 */
import Subscription from '../models/Subscription.model';
import User from '../models/User.model';
import LevelTemplate from '../models/LevelTemplate.model';
import { runSeed } from './runSeed';

export async function seedSubscriptions(): Promise<number> {
  const [users, levels] = await Promise.all([
    User.find({ role: 'user' }).select('_id').lean(),
    LevelTemplate.find().select('_id name').lean(),
  ]);
  if (users.length < 5) throw new Error('Need users. Run seed:users first.');
  if (levels.length < 1) throw new Error('Need level templates. Run seed:levels first.');

  const initiate = (levels as any[]).find((l) => l.name === 'Initiate');
  const initiateId = initiate?._id;
  const levelIds = levels.map((l: any) => l._id);

  await Subscription.deleteMany({});
  console.log('🧹 Deleted existing subscriptions');

  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const subs: any[] = [];

  users.forEach((u: any, i: number) => {
    // ~70% on Initiate, rest spread across other levels
    const useInitiate = initiateId && (i % 10 < 7);
    const levelId = useInitiate ? initiateId : levelIds[i % levelIds.length];

    const startAt = new Date(now.getTime() - 60 * day);
    let status: 'ACTIVE' | 'EXPIRED' | 'CANCELED' = 'ACTIVE';
    let endAt: Date;

    const r = i % 10;
    if (r < 6) {
      status = 'ACTIVE';
      endAt = new Date(now.getTime() + (30 + i * 3) * day);
      if (i % 5 === 2) endAt = new Date(now.getTime() + (3 + (i % 4)) * day); // expiring soon
    } else if (r < 9) {
      status = 'EXPIRED';
      endAt = new Date(now.getTime() - (5 + (i % 20)) * day);
    } else {
      status = 'CANCELED';
      endAt = new Date(now.getTime() + 15 * day);
    }

    const history: any[] = [
      { action: 'assign', toLevelTemplateId: levelId, date: new Date(startAt.getTime() - 2 * day) },
    ];
    if (i % 4 === 1) {
      history.push({ action: 'renew', fromLevelTemplateId: levelId, toLevelTemplateId: levelId, date: new Date(now.getTime() - 20 * day) });
    }
    if (i % 7 === 3 && levelIds.length > 1) {
      const otherId = levelIds[(i + 1) % levelIds.length];
      history.push({ action: 'change_level', fromLevelTemplateId: levelId, toLevelTemplateId: otherId, date: new Date(now.getTime() - 10 * day) });
    }
    if (status === 'CANCELED') {
      history.push({ action: 'cancel', fromLevelTemplateId: levelId, date: new Date(now.getTime() - 2 * day) });
    }

    subs.push({
      userId: u._id,
      levelTemplateId: levelId,
      status,
      startAt,
      endAt,
      autoRenew: false,
      history,
    });
  });

  await Subscription.insertMany(subs);
  const onInitiate = subs.filter((s) => s.levelTemplateId?.toString() === initiateId?.toString()).length;
  console.log(`✅ Subscriptions: ${subs.length} created (${onInitiate} on Initiate)`);
  return subs.length;
}

if (require.main === module) {
  runSeed('subscriptions', seedSubscriptions)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
