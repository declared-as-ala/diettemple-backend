/**
 * Account deletion (Apple App Store Guideline 5.1.1(v) — in-app account deletion).
 *
 * Removes the user document and all personal data tied to the account.
 * Orders are kept (financial/legal retention) but detached from login: once the
 * user document is gone, every outstanding JWT is rejected by the auth
 * middleware (it re-loads the user on each request), so all sessions are
 * effectively invalidated.
 */
import mongoose from 'mongoose';
import User from '../models/User.model';
import Subscription from '../models/Subscription.model';
import DailyProgram from '../models/DailyProgram.model';
import DailyNutritionLog from '../models/DailyNutritionLog.model';
import UserNutritionPlan from '../models/UserNutritionPlan.model';
import ClientPlanOverride from '../models/ClientPlanOverride.model';
import SessionOverride from '../models/SessionOverride.model';
import PlanAssignment from '../models/PlanAssignment.model';
import ExerciseHistory from '../models/ExerciseHistory.model';
import ExerciseProgression from '../models/ExerciseProgression.model';
import WorkoutSession from '../models/WorkoutSession.model';
import Favorite from '../models/Favorite.model';
import RecipeFavorite from '../models/RecipeFavorite.model';
import Cart from '../models/Cart.model';
import GymCheckin from '../models/GymCheckin.model';
import GymPresenceVerification from '../models/GymPresenceVerification.model';
import BodyProgressPhoto from '../models/BodyProgressPhoto.model';
import CoachNote from '../models/CoachNote.model';
import CoachEvent from '../models/CoachEvent.model';
import { deleteOldAvatarIfLocal } from '../lib/mediaStorage';

export interface AccountDeletionResult {
  deletedUser: boolean;
  deletedDocuments: Record<string, number>;
}

export async function deleteUserAccount(
  userId: mongoose.Types.ObjectId | string
): Promise<AccountDeletionResult> {
  const user = await User.findById(userId);
  if (!user) {
    return { deletedUser: false, deletedDocuments: {} };
  }

  const collections: Array<[string, mongoose.Model<any>]> = [
    ['subscriptions', Subscription],
    ['dailyPrograms', DailyProgram],
    ['dailyNutritionLogs', DailyNutritionLog],
    ['userNutritionPlans', UserNutritionPlan],
    ['clientPlanOverrides', ClientPlanOverride],
    ['sessionOverrides', SessionOverride],
    ['planAssignments', PlanAssignment],
    ['exerciseHistories', ExerciseHistory],
    ['exerciseProgressions', ExerciseProgression],
    ['workoutSessions', WorkoutSession],
    ['favorites', Favorite],
    ['recipeFavorites', RecipeFavorite],
    ['carts', Cart],
    ['gymCheckins', GymCheckin],
    ['gymPresenceVerifications', GymPresenceVerification],
    ['bodyProgressPhotos', BodyProgressPhoto],
    ['coachNotes', CoachNote],
    ['coachEvents', CoachEvent],
  ];

  const deletedDocuments: Record<string, number> = {};
  for (const [name, model] of collections) {
    const res = await model.deleteMany({ userId: user._id });
    if (res.deletedCount) deletedDocuments[name] = res.deletedCount;
  }

  // Remove locally stored avatar file if any
  try {
    deleteOldAvatarIfLocal((user as any).photoUri);
  } catch {
    /* best-effort file cleanup */
  }

  await User.deleteOne({ _id: user._id });

  return { deletedUser: true, deletedDocuments };
}
