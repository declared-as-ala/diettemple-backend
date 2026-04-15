import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import User from '../../models/User.model';
import Subscription from '../../models/Subscription.model';
import LevelTemplate from '../../models/LevelTemplate.model';
import SessionTemplate from '../../models/SessionTemplate.model';
import UserNutritionPlan from '../../models/UserNutritionPlan.model';
import NutritionPlanTemplate from '../../models/NutritionPlanTemplate.model';
import DailyNutritionLog from '../../models/DailyNutritionLog.model';
import WorkoutSession from '../../models/WorkoutSession.model';
import ClientPlanOverride from '../../models/ClientPlanOverride.model';
import SessionOverride from '../../models/SessionOverride.model';
import CoachNote from '../../models/CoachNote.model';
import AuditLog from '../../models/AuditLog.model';
import Program from '../../models/Program.model';
import WeeklyTemplate from '../../models/WeeklyTemplate.model';
import DailyProgram from '../../models/DailyProgram.model';
import Order from '../../models/Order.model';
import ExerciseHistory from '../../models/ExerciseHistory.model';
import Exercise from '../../models/Exercise.model';
import { AuthRequest } from '../../middleware/auth.middleware';

const router = Router();
const now = new Date();
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function effectiveStatus(sub: { status: string; endAt: Date }): string {
  if (sub.status !== 'ACTIVE') return sub.status;
  return sub.endAt < now ? 'EXPIRED' : 'ACTIVE';
}

function countWeekSessions(week: { days: Record<string, unknown[]> }): number {
  return DAY_KEYS.reduce((sum, d) => sum + (week.days?.[d]?.length ?? 0), 0);
}

// GET / — list with segment
router.get(
  '/',
  [
    query('segment').optional().isIn(['all', 'active', 'expired', 'expiring_soon', 'unassigned']),
    query('search').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const skip = (page - 1) * limit;
      const segment = (req.query.segment as string) || 'all';
      const search = (req.query.search as string) || '';
      const nowDate = new Date();

      const userFilter: Record<string, unknown> = { role: { $ne: 'admin' } };
      if (search) {
        userFilter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search.replace(/\s/g, ''), $options: 'i' } },
        ];
      }

      const [users, subscriptions, lastWorkoutByUser] = await Promise.all([
        User.find(userFilter).select('name email phone createdAt photoUri').sort({ name: 1 }).lean(),
        Subscription.find({}).populate('levelTemplateId', 'name').lean(),
        WorkoutSession.aggregate([
          { $match: { status: 'completed' } },
          { $sort: { date: -1 } },
          { $group: { _id: '$userId', lastDate: { $first: '$date' } } },
        ]),
      ]);

      const subByUser = new Map<string, any>();
      subscriptions.forEach((s: any) => {
        const uid = s.userId?.toString();
        if (uid) subByUser.set(uid, s);
      });
      const lastWorkout = new Map<string, Date>();
      lastWorkoutByUser.forEach((x: any) => lastWorkout.set(x._id.toString(), x.lastDate));

      const expiringEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      let list = users.map((u: any) => {
        const uid = u._id.toString();
        const sub = subByUser.get(uid);
        const eff = sub ? effectiveStatus(sub) : 'unassigned';
        const lastW = lastWorkout.get(uid);
        return {
          _id: uid,
          name: u.name,
          email: u.email,
          phone: u.phone,
          photoUri: u.photoUri || null,
          createdAt: u.createdAt,
          subscription: sub
            ? {
                _id: sub._id,
                levelTemplateId: sub.levelTemplateId?._id,
                levelName: sub.levelTemplateId?.name,
                status: sub.status,
                effectiveStatus: eff,
                startAt: sub.startAt,
                endAt: sub.endAt,
              }
            : null,
          lastWorkoutDate: lastW || null,
          segment: sub
            ? eff === 'ACTIVE' && sub.endAt >= nowDate && sub.endAt <= expiringEnd
                ? 'expiring_soon'
                : eff === 'ACTIVE'
                  ? 'active'
                  : 'expired'
            : 'unassigned',
        };
      });

      if (segment !== 'all') {
        list = list.filter((c: any) => c.segment === segment);
      }

      const total = list.length;
      const paginated = list.slice(skip, skip + limit);

      res.json({
        clients: paginated,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// POST / — create client (alias for onboarding)
router.post(
  '/',
  [
    body('name').optional().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const { name, email, phone, password } = req.body;
      if (!email && !phone) return res.status(400).json({ message: 'Either email or phone is required' });
      const bcrypt = await import('bcrypt');
      const existing = await User.findOne(email ? { email: email.toLowerCase() } : { phone: phone?.trim() });
      if (existing) return res.status(400).json({ message: email ? 'Email already in use' : 'Phone already in use' });
      const passwordHash = await bcrypt.default.hash(password, 10);
      const user = await User.create({
        name: name || undefined,
        email: email?.toLowerCase(),
        phone: phone?.trim() || undefined,
        passwordHash,
        role: 'user',
      });
      const doc = user.toObject();
      delete (doc as any).passwordHash;
      if (req.user?._id) {
        await AuditLog.create({
          actorAdminId: req.user._id,
          targetUserId: user._id,
          actionType: 'client_created',
          metadata: { name: user.name, email: user.email },
        });
      }
      res.status(201).json({ client: doc });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /:id/plan — base level template + client overrides merged
router.get(
  '/:id/plan',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const sub = await Subscription.findOne({ userId, status: 'ACTIVE', endAt: { $gt: now } })
        .populate('levelTemplateId')
        .lean();
      if (!sub) {
        return res.json({ baseLevelTemplate: null, override: null, mergedWeeks: null });
      }
      const level = sub.levelTemplateId as any;
      const levelDoc = await LevelTemplate.findById(level?._id).lean();
      const override = await ClientPlanOverride.findOne({ userId, status: 'active' }).lean();
      if (!levelDoc) {
        return res.json({ baseLevelTemplate: levelDoc, override: null, mergedWeeks: (levelDoc as any)?.weeks || null });
      }
      const baseWeeks = (levelDoc as any).weeks || [];
      const overrideWeeks = (override as any)?.overridesByWeek || [];
      const mergedWeeks = baseWeeks.map((w: any) => {
        const ow = overrideWeeks.find((x: any) => x.weekNumber === w.weekNumber);
        const days: Record<string, any[]> = {};
        DAY_KEYS.forEach((d) => {
          const ov = ow?.days?.[d];
          days[d] = (ov && ov.length > 0 ? ov : w.days?.[d] || []).map((p: any) => ({
            sessionTemplateId: p.sessionTemplateId,
            overrideSessionConfigId: p.overrideSessionConfigId || undefined,
            note: p.note,
            order: p.order ?? 0,
          }));
        });
        return { weekNumber: w.weekNumber, days };
      });
      res.json({
        baseLevelTemplate: levelDoc,
        override: override || null,
        mergedWeeks,
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// PUT /:id/plan/week/:weekNumber
router.put(
  '/:id/plan/week/:weekNumber',
  [
    param('id').isMongoId(),
    param('weekNumber').isInt({ min: 1, max: 5 }),
    body('days').isObject().withMessage('days required (mon..sun arrays)'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const userId = req.params.id;
      const weekNumber = parseInt(req.params.weekNumber);
      const days = req.body.days as Record<string, Array<{ sessionTemplateId: string; overrideSessionConfigId?: string; note?: string; order?: number }>>;
      const totalSessions = DAY_KEYS.reduce((sum, d) => sum + (days[d]?.length ?? 0), 0);
      if (totalSessions < 4 || totalSessions > 7) {
        return res.status(400).json({ message: 'Week must have 4–7 sessions' });
      }
      const sub = await Subscription.findOne({ userId, status: 'ACTIVE', endAt: { $gt: now } });
      if (!sub) return res.status(400).json({ message: 'No active subscription for this client' });
      let override = await ClientPlanOverride.findOne({ userId });
      if (!override) {
        override = await ClientPlanOverride.create({
          userId,
          baseLevelTemplateId: sub.levelTemplateId,
          status: 'active',
        });
      }
      const weekIdx = override.overridesByWeek.findIndex((w: any) => w.weekNumber === weekNumber);
      const newDays: Record<string, any[]> = {};
      DAY_KEYS.forEach((d) => {
        const arr = (days[d] || []).map((p: any) => ({
          sessionTemplateId: p.sessionTemplateId,
          overrideSessionConfigId: p.overrideSessionConfigId || undefined,
          note: p.note,
          order: p.order ?? 0,
        }));
        newDays[d] = arr;
      });
      if (weekIdx >= 0) {
        (override.overridesByWeek as any)[weekIdx].days = newDays;
      } else {
        (override.overridesByWeek as any).push({ weekNumber, days: newDays });
      }
      await override.save();
      if (req.user?._id) {
        await AuditLog.create({
          actorAdminId: req.user._id,
          targetUserId: userId,
          actionType: 'plan_override',
          metadata: { weekNumber },
        });
      }
      const out = await ClientPlanOverride.findById(override._id).lean();
      res.json({ planOverride: out });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// POST /:id/plan/reset-week/:weekNumber
router.post(
  '/:id/plan/reset-week/:weekNumber',
  [param('id').isMongoId(), param('weekNumber').isInt({ min: 1, max: 5 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const weekNumber = parseInt(req.params.weekNumber);
      const override = await ClientPlanOverride.findOne({ userId });
      if (!override) return res.json({ planOverride: null, message: 'No override to reset' });
      const weekIdx = (override.overridesByWeek as any).findIndex((w: any) => w.weekNumber === weekNumber);
      if (weekIdx >= 0) {
        const levelDoc = await LevelTemplate.findById(override.baseLevelTemplateId).lean();
        const baseWeek = (levelDoc as any)?.weeks?.find((w: any) => w.weekNumber === weekNumber);
        (override.overridesByWeek as any)[weekIdx].days = baseWeek?.days || {};
        await override.save();
      }
      if (req.user?._id) {
        await AuditLog.create({
          actorAdminId: req.user._id,
          targetUserId: userId,
          actionType: 'plan_override',
          metadata: { weekNumber, action: 'reset' },
        });
      }
      res.json({ planOverride: await ClientPlanOverride.findById(override._id).lean() });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// PUT /:id/session-override/:sessionTemplateId
router.put(
  '/:id/session-override/:sessionTemplateId',
  [
    param('id').isMongoId(),
    param('sessionTemplateId').isMongoId(),
    body('items').isArray().withMessage('items array required'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const userId = req.params.id;
      const sessionTemplateId = req.params.sessionTemplateId;
      const items = req.body.items;
      const template = await SessionTemplate.findById(sessionTemplateId);
      if (!template) return res.status(404).json({ message: 'Session template not found' });
      let override = await SessionOverride.findOne({ userId, sessionTemplateId });
      if (!override) {
        override = await SessionOverride.create({ userId, sessionTemplateId, items: items || [] });
      } else {
        override.items = items;
        await override.save();
      }
      if (req.user?._id) {
        await AuditLog.create({
          actorAdminId: req.user._id,
          targetUserId: userId,
          actionType: 'session_override',
          metadata: { sessionTemplateId },
        });
      }
      const out = await SessionOverride.findById(override._id).populate('items.exerciseId', 'name').lean();
      res.json({ sessionOverride: out });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// PUT /:id/nutrition-target — set direct nutrition targets on the client (no template required)
router.put(
  '/:id/nutrition-target',
  [
    param('id').isMongoId(),
    body('dailyCalories').optional().isInt({ min: 0 }),
    body('proteinG').optional().isInt({ min: 0 }),
    body('carbsG').optional().isInt({ min: 0 }),
    body('fatG').optional().isInt({ min: 0 }),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const userId = req.params.id;
      const { dailyCalories, proteinG, carbsG, fatG } = req.body;
      const target: Record<string, number> = {};
      if (dailyCalories != null) target['nutritionTarget.dailyCalories'] = Number(dailyCalories);
      if (proteinG != null) target['nutritionTarget.proteinG'] = Number(proteinG);
      if (carbsG != null) target['nutritionTarget.carbsG'] = Number(carbsG);
      if (fatG != null) target['nutritionTarget.fatG'] = Number(fatG);
      const user = await User.findByIdAndUpdate(userId, { $set: target }, { new: true }).select('-passwordHash -otp -otpExpires').lean();
      if (!user) return res.status(404).json({ message: 'User not found' });
      res.json({ nutritionTarget: (user as any).nutritionTarget || {} });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /:id/nutrition — assignment + recent logs
router.get(
  '/:id/nutrition',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const assignment = await UserNutritionPlan.findOne({ userId })
        .sort({ createdAt: -1 })
        .populate('nutritionPlanTemplateId')
        .lean();
      const logs = await DailyNutritionLog.find({ userId }).sort({ date: -1 }).limit(30).lean();
      res.json({
        assignment: assignment || null,
        logs: logs || [],
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// POST /:id/coach-note
router.post(
  '/:id/coach-note',
  [
    param('id').isMongoId(),
    body('date').isISO8601(),
    body('message').notEmpty().trim(),
    body('title').optional().trim(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const userId = req.params.id;
      const { date, message, title } = req.body;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const note = await CoachNote.create({
        userId,
        date: new Date(date),
        message,
        title: title || undefined,
        createdByAdminId: req.user!._id!,
      });
      await AuditLog.create({
        actorAdminId: req.user!._id!,
        targetUserId: userId,
        actionType: 'note_added',
        metadata: { noteId: note._id, date },
      });
      const out = await CoachNote.findById(note._id).populate('createdByAdminId', 'name').lean();
      res.status(201).json({ coachNote: out });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /:id/timeline — audit log + subscription history + coach notes
router.get(
  '/:id/timeline',
  [param('id').isMongoId(), query('limit').optional().isInt({ min: 1, max: 100 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const limit = parseInt((req.query.limit as string) || '50');
      const [subs, notes, audits] = await Promise.all([
        Subscription.find({ userId }).populate('levelTemplateId', 'name').sort({ createdAt: -1 }).limit(5).lean(),
        CoachNote.find({ userId }).sort({ date: -1 }).limit(20).lean(),
        AuditLog.find({ targetUserId: userId }).populate('actorAdminId', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      ]);
      const events: Array<{ type: string; date: Date; title?: string; meta?: any }> = [];
      subs.forEach((s: any) => {
        (s.history || []).forEach((h: any) => {
          events.push({
            type: 'subscription',
            date: h.date,
            title: h.action,
            meta: { fromLevel: h.fromLevelTemplateId, toLevel: h.toLevelTemplateId, note: h.note },
          });
        });
      });
      notes.forEach((n: any) => {
        events.push({ type: 'coach_note', date: n.createdAt, title: n.title || 'Coach note', meta: { message: n.message } });
      });
      audits.forEach((a: any) => {
        events.push({
          type: 'audit',
          date: (a as any).createdAt,
          title: (a as any).actionType,
          meta: (a as any).metadata,
        });
      });
      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json({ timeline: events.slice(0, limit) });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /:id/analytics — client analytics (must be before GET /:id)
router.get(
  '/:id/orders',
  [param('id').isMongoId(), query('limit').optional().isInt({ min: 1, max: 100 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const limit = parseInt((req.query.limit as string) || '25');
      const user = await User.findById(userId).select('_id').lean();
      if (!user) return res.status(404).json({ message: 'User not found' });
      const orders = await Order.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('reference status paymentStatus paymentMethod totalPrice subtotal discount deliveryFee createdAt updatedAt')
        .lean();

      const summaryAgg = await Order.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, 1, 0] } },
            totalSpent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$paymentStatus', 'PAID'] },
                      { $in: ['$status', ['paid', 'confirmed', 'shipped', 'delivered']] },
                    ],
                  },
                  '$totalPrice',
                  0,
                ],
              },
            },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]);

      const summary = summaryAgg[0] || {
        totalOrders: 0,
        paidOrders: 0,
        totalSpent: 0,
        lastOrderAt: null,
      };

      res.json({ orders, summary });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.get(
  '/:id/exercise-load-history',
  [param('id').isMongoId(), query('limit').optional().isInt({ min: 1, max: 100 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const limit = parseInt((req.query.limit as string) || '50');

      const workoutSessions = await WorkoutSession.find({ userId, status: 'completed' })
        .sort({ date: -1 })
        .limit(80)
        .select('date completedAt exercises')
        .lean();

      const histories = await ExerciseHistory.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      const historyByExercise = new Map<string, any>();
      const exerciseIdSet = new Set<string>();
      histories.forEach((h: any) => {
        const exId = h.exerciseId?.toString?.() || h.exerciseId;
        if (!exId) return;
        exerciseIdSet.add(String(exId));
        historyByExercise.set(String(exId), h);
      });

      const sessionsByExercise = new Map<string, Array<any>>();
      workoutSessions.forEach((session: any) => {
        (session.exercises || []).forEach((exerciseSession: any) => {
          const exId = exerciseSession.exerciseId?.toString?.() || exerciseSession.exerciseId;
          if (!exId) return;
          const key = String(exId);
          exerciseIdSet.add(key);
          const normalizedSets = (exerciseSession.sets || []).map((s: any) => ({
            setNumber: s.setNumber ?? 0,
            weightKg: s.weight ?? 0,
            reps: s.repsCompleted ?? s.reps ?? 0,
            completed: !!s.completed,
            completedAt: s.completedAt ?? null,
          }));
          if (!sessionsByExercise.has(key)) sessionsByExercise.set(key, []);
          sessionsByExercise.get(key)!.push({
            sessionDate: session.date ?? null,
            completedAt: session.completedAt ?? null,
            sets: normalizedSets,
          });
        });
      });

      const exerciseIds = Array.from(exerciseIdSet);

      const exercises = await Exercise.find({ _id: { $in: exerciseIds } })
        .select('name muscleGroup')
        .lean();
      const exerciseNameById = new Map<string, { name: string; muscleGroup?: string }>();
      exercises.forEach((e: any) => {
        exerciseNameById.set(e._id.toString(), { name: e.name, muscleGroup: e.muscleGroup });
      });

      const grouped = exerciseIds.map((exId) => {
        const h = historyByExercise.get(String(exId));
        const ex = exerciseNameById.get(String(exId));
        return {
          exerciseId: exId,
          exerciseName: ex?.name || 'Exercice',
          muscleGroup: ex?.muscleGroup || null,
          lastWeight: h?.lastWeight ?? 0,
          lastReps: h?.lastReps ?? [],
          lastCompletedAt: h?.lastCompletedAt ?? null,
          totalVolume: h?.totalVolume ?? 0,
          progressionStatus: h?.progressionStatus ?? 'stable',
          sets: (h?.lastSets || []).map((s: any) => ({
            setNumber: s.setNumber ?? 0,
            weightKg: s.weight ?? 0,
            reps: s.reps ?? 0,
            completed: !!s.completed,
            completedAt: s.completedAt ?? null,
          })),
          sessions: sessionsByExercise.get(String(exId)) || [],
        };
      }).sort((a, b) => {
        const ad = a.lastCompletedAt ? new Date(a.lastCompletedAt).getTime() : 0;
        const bd = b.lastCompletedAt ? new Date(b.lastCompletedAt).getTime() : 0;
        return bd - ad;
      });

      res.json({ items: grouped });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

router.get(
  '/:id/analytics',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId).lean();
      if (!user) return res.status(404).json({ message: 'User not found' });
      const workoutSessions = await WorkoutSession.find({ userId })
        .populate('sessionId')
        .sort({ date: -1 })
        .limit(30)
        .lean();
      const program = await Program.findOne({ userId }).populate('weeklyTemplateId').lean();
      const totalWorkouts = workoutSessions.length;
      const completedWorkouts = workoutSessions.filter((w: any) => w.status === 'completed').length;
      const skippedExercises = workoutSessions.reduce((sum: number, w: any) => {
        return sum + (w.exercises || []).filter((e: any) => e.status === 'skipped').length;
      }, 0);
      const recentSessions = workoutSessions.slice(0, 10);
      const exerciseProgression: Record<string, any[]> = {};
      for (const session of recentSessions as any[]) {
        for (const exerciseSession of session.exercises || []) {
          const exerciseId = exerciseSession.exerciseId?.toString?.() || exerciseSession.exerciseId;
          if (!exerciseId) continue;
          if (!exerciseProgression[exerciseId]) exerciseProgression[exerciseId] = [];
          const completedSets = (exerciseSession.sets || []).filter((s: any) => s.completed);
          if (completedSets.length > 0) {
            const avgWeight = completedSets.reduce((s: number, x: any) => s + (x.weight || 0), 0) / completedSets.length;
            exerciseProgression[exerciseId].push({
              date: session.date,
              weight: avgWeight,
              sets: completedSets.length,
            });
          }
        }
      }
      res.json({
        user,
        stats: {
          totalWorkouts,
          completedWorkouts,
          skippedExercises,
          completionRate: totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0,
        },
        program,
        exerciseProgression,
        recentWorkouts: recentSessions,
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// POST /:id/assign-program
router.post(
  '/:id/assign-program',
  [
    param('id').isMongoId(),
    body('weeklyTemplateId').isMongoId().withMessage('Weekly template is required'),
    body('startDate').isISO8601().withMessage('Start date is required'),
    body('durationWeeks').isInt({ min: 1 }).withMessage('Duration must be at least 1 week'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
      const userId = req.params.id;
      const { weeklyTemplateId, startDate, durationWeeks } = req.body;
      const existingProgram = await Program.findOne({ userId, status: 'ACTIVE' });
      if (existingProgram) return res.status(400).json({ message: 'User already has an active program' });
      const program = await Program.create({
        userId,
        weeklyTemplateId,
        startDate: new Date(startDate),
        durationWeeks,
        status: 'ACTIVE',
      });
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + durationWeeks * 7);
      const weeklyTemplate = await WeeklyTemplate.findById(weeklyTemplateId).lean();
      if (!weeklyTemplate) return res.status(404).json({ message: 'Weekly template not found' });
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dailyPrograms: any[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const sessionId = (weeklyTemplate as any)[dayName] || null;
        dailyPrograms.push({
          date: new Date(d),
          userId,
          sessionId,
          weekNumber: Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
        });
      }
      await DailyProgram.insertMany(dailyPrograms);
      const populated = await Program.findById(program._id)
        .populate('userId', 'name email photoUri level')
        .populate('weeklyTemplateId')
        .lean();
      res.status(201).json({ program: populated });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /:id — profile overview (must be last)
router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;
      const [user, sub, nutritionAssignment, lastNote, lastWorkout] = await Promise.all([
        User.findById(userId).select('-passwordHash -otp -otpExpires').lean(),
        Subscription.findOne({ userId }).sort({ endAt: -1 }).populate('levelTemplateId', 'name').lean(),
        UserNutritionPlan.findOne({ userId }).sort({ createdAt: -1 }).populate('nutritionPlanTemplateId', 'name dailyCalories').lean(),
        CoachNote.findOne({ userId }).sort({ date: -1 }).lean(),
        WorkoutSession.findOne({ userId, status: 'completed' }).sort({ date: -1 }).select('date').lean(),
      ]);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const ordersSummaryAgg = await Order.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            paidOrders: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, 1, 0] } },
            totalSpent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$paymentStatus', 'PAID'] },
                      { $in: ['$status', ['paid', 'confirmed', 'shipped', 'delivered']] },
                    ],
                  },
                  '$totalPrice',
                  0,
                ],
              },
            },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]);
      const ordersSummary = ordersSummaryAgg[0] || {
        totalOrders: 0,
        paidOrders: 0,
        totalSpent: 0,
        lastOrderAt: null,
      };
      const ageNumeric = Number((user as any).age);
      const profileCompletion = {
        hasName: !!(user as any).name,
        hasPhoto: !!(user as any).photoUri,
        hasSexe: !!(user as any).sexe,
        hasAge: !!(user as any).age,
        hasTaille: !!(user as any).taille,
        hasPoids: !!(user as any).poids,
        hasEmailOrPhone: !!((user as any).email || (user as any).phone),
      };
      const eff = sub ? effectiveStatus(sub as any) : null;
      const setupChecklist = {
        subscription: !!sub && eff === 'ACTIVE',
        trainingPlan: !!sub && eff === 'ACTIVE',
        dietPlan: !!nutritionAssignment && (nutritionAssignment as any).status === 'ACTIVE' && new Date((nutritionAssignment as any).endAt) >= now,
        nextCheckIn: !!lastNote,
      };
      res.json({
        client: user,
        subscription: sub ? { ...sub, effectiveStatus: eff } : null,
        nutritionAssignment: nutritionAssignment || null,
        lastCoachNote: lastNote || null,
        lastWorkoutDate: (lastWorkout as any)?.date || null,
        profileMeta: {
          photoUri: (user as any).photoUri || null,
          sexe: (user as any).sexe || null,
          age: (user as any).age || null,
          ageValue: Number.isFinite(ageNumeric) ? ageNumeric : null,
          taille: (user as any).taille || null,
          poids: (user as any).poids || null,
          objectif: (user as any).objectif || null,
          profileCompletion,
        },
        commerceSummary: ordersSummary,
        setupChecklist,
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
