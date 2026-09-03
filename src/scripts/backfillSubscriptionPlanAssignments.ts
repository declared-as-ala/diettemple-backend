import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Subscription from '../models/Subscription.model';
import PlanAssignment from '../models/PlanAssignment.model';
import { syncWorkoutAssignmentFromSubscription } from '../services/workoutAssignment.service';

dotenv.config();

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const now = new Date();
  const subscriptions = await Subscription.find({ status: 'ACTIVE', endAt: { $gt: now } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  let created = 0;
  let skipped = 0;

  for (const subscription of subscriptions) {
    const existing = await PlanAssignment.findOne({ userId: subscription.userId, status: 'active' }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }
    await syncWorkoutAssignmentFromSubscription({
      subscriptionId: subscription._id,
      userId: subscription.userId,
      levelTemplateId: subscription.levelTemplateId,
      startDate: subscription.startAt,
      note: 'Backfilled from active production subscription',
    });
    created += 1;
  }

  console.log(JSON.stringify({ activeSubscriptions: subscriptions.length, created, skipped }));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
