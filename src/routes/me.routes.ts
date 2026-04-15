/**
 * Authenticated user "me" routes: subscription, today dashboard, nutrition, plan, session, exercise.
 */
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { query, param, body, validationResult } from 'express-validator';
import Subscription from '../models/Subscription.model';
import LevelTemplate from '../models/LevelTemplate.model';
import SessionTemplate from '../models/SessionTemplate.model';
import Session from '../models/Session.model';
import DailyProgram from '../models/DailyProgram.model';
import Exercise from '../models/Exercise.model';
import UserNutritionPlan from '../models/UserNutritionPlan.model';
import NutritionPlanTemplate from '../models/NutritionPlanTemplate.model';
import DailyNutritionLog from '../models/DailyNutritionLog.model';
import Food from '../models/Food.model';
import RecipeFavorite from '../models/RecipeFavorite.model';
import User from '../models/User.model';
import ClientPlanOverride from '../models/ClientPlanOverride.model';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Level template + GET /plan/week use positional keys: "mon" = day 0 of each program week
 * (first day after planStart), NOT necessarily a real Monday. Must match plan/week loop:
 * dayKeys[i] for i = 0..6 with dayDate = planStart + (weekNumber-1)*7 + i.
 */
const PLAN_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type PlanTemplateDayKey = (typeof PLAN_DAY_KEYS)[number];

/**
 * Parse YYYY-MM-DD as the user's intended calendar day (from mobile local date).
 * Uses UTC midnight for that date for DailyProgram / log queries and civil diffDays vs startAt.
 */
function parseCalendarDateForMeToday(dateStr: string): {
  today: Date;
  endOfDay: Date;
  /** Real calendar weekday label for ?date= (display only) */
  dayName: string;
} {
  const trimmed = dateStr.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) {
    const d = new Date(trimmed);
    d.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const idx = d.getDay();
    return { today: d, endOfDay: end, dayName: DAY_NAMES[idx] };
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const today = new Date(Date.UTC(y, mo - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(y, mo - 1, day, 23, 59, 59, 999));
  const utcDow = today.getUTCDay();
  return {
    today,
    endOfDay,
    dayName: DAY_NAMES[utcDow],
  };
}

/** Slot within a Mon–Sun week: diffDays from program anchor Monday; 0 → mon. */
function planTemplateDayKeyFromDiffDays(diffDays: number): PlanTemplateDayKey {
  const idx = ((diffDays % 7) + 7) % 7;
  return PLAN_DAY_KEYS[idx];
}

/** Start of calendar day in UTC (for subscription start alignment). */
function utcStartOfCalendarDate(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Monday 00:00 UTC of the week that contains `d`'s UTC calendar date.
 * Admin planner labels LUN→DIM as real Mon→Sun; template keys mon..sun must match that,
 * not "day 0 = subscription start" rolling weeks.
 */
function utcMondayStartOfWeekContaining(d: Date): number {
  const ms = utcStartOfCalendarDate(d);
  const dow = new Date(ms).getUTCDay(); // 0 Sun … 6 Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return ms - daysSinceMonday * MS_PER_DAY;
}

/** Calendar days from today (server start-of-day) to endAt start-of-day. Can be negative if expired. */
function daysRemaining(endAt: Date): number {
  const end = new Date(endAt);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export type SubscriptionDisplayStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELED';

/** Single source of truth: compute display status and daysRemaining server-side. */
function computeSubscriptionState(sub: { status: string; endAt: Date } | null): {
  status: SubscriptionDisplayStatus;
  daysRemaining: number;
} {
  if (!sub) return { status: 'EXPIRED', daysRemaining: 0 };
  const rawStatus = sub.status as string;
  if (rawStatus === 'CANCELED') return { status: 'CANCELED', daysRemaining: 0 };
  const days = daysRemaining(sub.endAt);
  const now = new Date();
  if (now >= new Date(sub.endAt)) return { status: 'EXPIRED', daysRemaining: days };
  if (days >= 0 && days <= 7) return { status: 'EXPIRING_SOON', daysRemaining: days };
  return { status: 'ACTIVE', daysRemaining: days };
}

function getLastActionFromHistory(history: { action: string; date: Date }[] | undefined): { action: string; date: Date } | null {
  if (!history?.length) return null;
  const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const last = sorted[0];
  const actionMap: Record<string, string> = { renew: 'RENEW', change_level: 'UPGRADE', cancel: 'CANCELED' };
  const displayAction = actionMap[last.action] || last.action?.toUpperCase?.() || null;
  return displayAction ? { action: displayAction, date: last.date } : null;
}

// GET /api/me/subscription — returns same shape as /today subscription object
router.get('/subscription', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    let sub = await Subscription.findOne({ userId, status: 'ACTIVE', endAt: { $gt: new Date() } })
      .populate('levelTemplateId', 'name')
      .lean();
    if (!sub) {
      sub = await Subscription.findOne({ userId }).sort({ endAt: -1 }).populate('levelTemplateId', 'name').lean();
    }
    if (!sub) return res.json({ subscription: null });

    const s = sub as any;
    const { status, daysRemaining: days } = computeSubscriptionState({ status: s.status, endAt: s.endAt });
    const lastAction = getLastActionFromHistory(s.history);
    res.json({
      subscription: {
        status,
        startAt: s.startAt,
        endAt: s.endAt,
        daysRemaining: days,
        levelName: s.levelTemplateId?.name ?? null,
        lastAction: lastAction?.action ?? null,
        lastActionAt: lastAction?.date ?? null,
      },
    });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

// GET /api/me/today
router.get(
  '/today',
  [query('date').optional().isISO8601()],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const { today, endOfDay, dayName } = parseCalendarDateForMeToday(dateStr);

      let subscription: any = null;
      let todaySession: any = null;
      let weekNumber = 1;
      /** True when subscription is tied to a level template with weeks (admin 5-week plan). */
      let hasLevelTemplatePlan = false;

      // ── 1. Load subscription first — it is the source of truth for week/day ──
      let sub = await Subscription.findOne({
        userId,
        status: 'ACTIVE',
        endAt: { $gt: new Date() },
      }).populate('levelTemplateId');
      if (!sub) {
        sub = await Subscription.findOne({ userId }).sort({ endAt: -1 }).populate('levelTemplateId').lean() as any;
      }

      if (sub) {
        const { status: subStatus, daysRemaining: days } = computeSubscriptionState({ status: sub.status, endAt: sub.endAt });
        const lastAction = getLastActionFromHistory((sub as any).history);
        subscription = {
          status: subStatus,
          startAt: sub.startAt,
          endAt: sub.endAt,
          daysRemaining: days,
          levelName: (sub.levelTemplateId as any)?.name ?? null,
          lastAction: lastAction?.action ?? null,
          lastActionAt: lastAction?.date ?? null,
        };
      }

      // ── 2. LevelTemplate is authoritative for workout — resolve week + day from it ──
      if (sub) {
        const level = sub.levelTemplateId as any;
        const levelDoc = level?._id ? await LevelTemplate.findById(level._id).lean() : null;
        hasLevelTemplatePlan =
          !!levelDoc && Array.isArray((levelDoc as any).weeks) && (levelDoc as any).weeks.length > 0;

        if (hasLevelTemplatePlan) {
          const programAnchorMs = utcMondayStartOfWeekContaining(new Date(sub.startAt));
          const todayUtcMs = utcStartOfCalendarDate(today);
          const diffDays = Math.floor((todayUtcMs - programAnchorMs) / MS_PER_DAY);
          weekNumber = Math.min(5, Math.max(1, Math.floor(diffDays / 7) + 1));
          const templateDayKey = planTemplateDayKeyFromDiffDays(diffDays);
          const week = (levelDoc as any)?.weeks?.find((w: any) => w.weekNumber === weekNumber);
          const placements = week?.days?.[templateDayKey] || [];
          const firstPlacement = placements[0];
          if (firstPlacement?.sessionTemplateId) {
            const session = await SessionTemplate.findById(firstPlacement.sessionTemplateId)
              .select('title durationMinutes difficulty items')
              .lean();
            if (session) {
              const items = (session as any).items ?? [];
              todaySession = {
                sessionTemplateId: (session as any)._id,
                title: (session as any).title,
                durationMinutes: (session as any).durationMinutes,
                difficulty: (session as any).difficulty,
                exerciseCount: Array.isArray(items) ? items.length : 0,
              };
            }
          }
        }
      }

      // Row for nutrition / calorieTarget; never used for workout when hasLevelTemplatePlan (avoids stale Push B etc.)
      const dailyProgram = await DailyProgram.findOne({
        userId,
        date: { $gte: today, $lte: endOfDay },
      }).lean();

      // ── 3. DailyProgram session — only for legacy users without a 5-week level template ──
      if (!todaySession && !hasLevelTemplatePlan && dailyProgram) {
        const dp = dailyProgram as any;
        if (dp.weekNumber != null) weekNumber = dp.weekNumber;
        const sessionIdToUse = dp.sessionTemplateId || dp.sessionId;
        if (sessionIdToUse) {
          const session = await SessionTemplate.findById(sessionIdToUse)
            .select('title durationMinutes difficulty items')
            .lean();
          if (session) {
            const items = (session as any).items ?? [];
            todaySession = {
              sessionTemplateId: (session as any)._id,
              title: (session as any).title,
              durationMinutes: (session as any).durationMinutes,
              difficulty: (session as any).difficulty,
              exerciseCount: Array.isArray(items) ? items.length : 0,
            };
          } else {
            const legSession = await Session.findById(sessionIdToUse).select('title duration difficulty').lean();
            if (legSession) {
              todaySession = {
                sessionTemplateId: (legSession as any)._id,
                title: (legSession as any).title,
                durationMinutes: (legSession as any).duration,
                difficulty: (legSession as any).difficulty,
              };
            }
          }
        }
      }

      const now = new Date();
      const nutritionAssignment = await UserNutritionPlan.findOne({
        userId,
        status: 'ACTIVE',
        startAt: { $lte: now },
        endAt: { $gte: now },
      }).populate('nutritionPlanTemplateId');

      // Always fetch admin-set direct targets — they override everything
      const userNtDoc = await User.findById(userId).select('nutritionTarget').lean();
      const userNt = (userNtDoc as any)?.nutritionTarget;

      let nutritionTargets: any = null;
      let meals: any[] = [];
      if (nutritionAssignment) {
        const template = nutritionAssignment.nutritionPlanTemplateId as any;
        const adj = nutritionAssignment.adjustments || {};
        // User.nutritionTarget (set by coach) takes priority over plan template values
        nutritionTargets = {
          dailyCalories: userNt?.dailyCalories ?? adj.dailyCalories ?? template?.dailyCalories,
          proteinG:      userNt?.proteinG      ?? adj.proteinG      ?? template?.macros?.proteinG,
          carbsG:        userNt?.carbsG        ?? adj.carbsG        ?? template?.macros?.carbsG,
          fatG:          userNt?.fatG          ?? adj.fatG          ?? template?.macros?.fatG,
        };
        meals = template?.mealsTemplate || [];
      }
      // Fallback: use DailyProgram.calorieTarget as objectif du jour when no nutrition plan
      if (!nutritionTargets && dailyProgram && (dailyProgram as any).calorieTarget != null) {
        nutritionTargets = { dailyCalories: (dailyProgram as any).calorieTarget };
      }
      // Final fallback: admin-set nutritionTarget
      if (!nutritionTargets && userNt?.dailyCalories) {
        nutritionTargets = {
          dailyCalories: userNt.dailyCalories,
          proteinG: userNt.proteinG,
          carbsG: userNt.carbsG,
          fatG: userNt.fatG,
        };
      }

      const log = await DailyNutritionLog.findOne({ userId, date: today }).lean();

      const plan =
        sub && sub.startAt && sub.endAt
          ? {
              planStartDate: sub.startAt,
              planEndDate: sub.endAt,
              durationWeeks: 5,
            }
          : null;

      res.json({
        subscription,
        plan,
        today: {
          date: dateStr,
          weekNumber,
          dayName,
          sessionTemplate: todaySession,
          sessionId: todaySession?.sessionTemplateId ?? null,
          sessionTitle: todaySession?.title ?? null,
          isRestDay: !todaySession?.sessionTemplateId,
          nutritionTargets,
          meals,
          log: log
            ? {
                consumedCalories: (log as any).consumedCalories,
                consumedMacros: (log as any).consumedMacros,
                waterMl: (log as any).waterMl,
                status: (log as any).status,
              }
            : null,
        },
        progress: {
          streaks: { workout: 0, nutrition: 0 },
          lastWorkout: null,
          xp: 0,
          level: 1,
        },
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

/** Normalize YYYY-MM-DD to start-of-day UTC so queries match stored docs (never reuse another day). */
function parseDateKey(dateKey: string): Date {
  const d = new Date(dateKey + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');
  return d;
}

// GET /api/me/nutrition/today?date=YYYY-MM-DD — per-day totals only; no log for date = 0 consumed
router.get(
  '/nutrition/today',
  [query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/)],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const date = parseDateKey(dateStr);

      const assignment = await UserNutritionPlan.findOne({
        userId,
        status: 'ACTIVE',
        startAt: { $lte: date },
        endAt: { $gte: date },
      }).populate('nutritionPlanTemplateId');

      // Always fetch admin-set direct targets — they override everything
      const userDoc = await User.findById(userId).select('nutritionTarget').lean();
      const nt = (userDoc as any)?.nutritionTarget;

      if (!assignment) {
        const fallbackTargets = nt?.dailyCalories
          ? { dailyCalories: nt.dailyCalories, proteinG: nt.proteinG, carbsG: nt.carbsG, fatG: nt.fatG }
          : null;
        const log = await DailyNutritionLog.findOne({ userId, date }).lean();
        return res.json({ targets: fallbackTargets, meals: [], log, dateKey: dateStr });
      }

      const template = assignment.nutritionPlanTemplateId as any;
      const adj = assignment.adjustments || {};
      // User.nutritionTarget (set by coach) takes priority over plan template values
      const targets = {
        dailyCalories: nt?.dailyCalories ?? adj.dailyCalories ?? template?.dailyCalories,
        proteinG:      nt?.proteinG      ?? adj.proteinG      ?? template?.macros?.proteinG,
        carbsG:        nt?.carbsG        ?? adj.carbsG        ?? template?.macros?.carbsG,
        fatG:          nt?.fatG          ?? adj.fatG          ?? template?.macros?.fatG,
      };
      const log = await DailyNutritionLog.findOne({ userId, date }).lean();

      res.json({
        targets,
        meals: template?.mealsTemplate || [],
        recommendations: template?.recommendations || [],
        dateKey: dateStr,
        log: log
          ? {
              consumedCalories: (log as any).consumedCalories ?? 0,
              consumedMacros: {
                proteinG: (log as any).consumedMacros?.proteinG ?? 0,
                carbsG: (log as any).consumedMacros?.carbsG ?? 0,
                fatG: (log as any).consumedMacros?.fatG ?? 0,
              },
              waterMl: (log as any).waterMl,
              completedMealsIds: (log as any).completedMealsIds,
              status: (log as any).status,
            }
          : null,
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// Multer for scan-meal: optional photo file (multipart) or use body.imageBase64 in handler
const scanMealUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format d\'image non supporté'));
  },
}).single('photo');

// POST /api/me/nutrition/scan-meal — OpenRouter vision analysis only (no auto-save). Multipart (photo) or JSON (imageBase64).
router.post(
  '/nutrition/scan-meal',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.is('multipart/form-data')) return scanMealUpload(req, res, next);
    next();
  },
  [
    body('imageBase64').optional().isString(),
    body('dateKey').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user?._id) return res.status(401).json({ message: 'Unauthorized' });

      let buffer: Buffer;
      let mime = 'image/jpeg';
      if (req.file?.buffer) {
        buffer = req.file.buffer;
        mime = (req.file.mimetype || mime).toLowerCase();
        if (process.env.NODE_ENV !== 'production') {
          console.log('[meal-scan] file ok: type=', mime, 'size=', buffer.length, 'dims later');
        }
      } else {
        const imageBase64 = (req.body?.imageBase64 as string) || '';
        if (!imageBase64) {
          console.warn('[meal-scan] 400: imageBase64 missing');
          return res.status(400).json({
            ok: false,
            code: 'invalid_input',
            message: 'Image requise. Prends une photo ou en choisis une dans la galerie.',
          });
        }
        try {
          buffer = Buffer.from(imageBase64, 'base64');
        } catch {
          console.warn('[meal-scan] 400: base64 decode failed');
          return res.status(400).json({
            ok: false,
            code: 'invalid_input',
            message: 'Image invalide (format). Réessaie avec une autre photo.',
          });
        }
        if (buffer.length === 0) {
          console.warn('[meal-scan] 400: empty buffer after base64 decode');
          return res.status(400).json({
            ok: false,
            code: 'invalid_input',
            message: 'Image vide. Prends une photo ou en choisis une dans la galerie.',
          });
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[meal-scan] base64 ok: length=', buffer.length);
        }
      }

      const { validateMealImage, resizeMealImageIfNeeded } = await import('../utils/imageValidation');
      const validation = await validateMealImage(buffer, mime);
      if (!validation.valid) {
        console.warn('[meal-scan] 400: validation failed', validation.code, validation.message);
        return res.status(400).json({
          ok: false,
          code: validation.code,
          message: validation.message,
        });
      }
      let imageBuffer = validation.buffer;
      const resized = await resizeMealImageIfNeeded(imageBuffer, validation.mime);
      if (resized !== imageBuffer) imageBuffer = resized;

      const { analyzeMealWithOpenRouter } = await import('../lib/mealScanOpenRouter.service');
      const { searchSuggestedFoods } = await import('../lib/mealScanVision');

      const result = await analyzeMealWithOpenRouter(imageBuffer, validation.mime);

      if (!result.ok) {
        return res.status(503).json({
          ok: false,
          code: result.code,
          message: result.message,
          items: [],
        });
      }

      const itemsWithSuggestions = await Promise.all(
        result.items.map(async (item) => {
          const suggestedFoods = await searchSuggestedFoods(item.label, 3);
          const fromDb = suggestedFoods.map((f) => ({
            foodId: f.foodId,
            name: f.name,
            macrosPer100g: f.macrosPer100g,
          }));
          // If no DB match but AI returned macros, add one suggestion with AI macros so frontend can show macros
          if (fromDb.length === 0 && item.macrosPer100g) {
            fromDb.push({
              foodId: '',
              name: item.label,
              macrosPer100g: item.macrosPer100g,
            });
          }
          return {
            label: item.label,
            confidence: item.confidence,
            category: item.category,
            defaultGrams: item.defaultGrams,
            suggestedFoods: fromDb,
            macrosPer100g: item.macrosPer100g ?? (fromDb[0] as any)?.macrosPer100g ?? undefined,
          };
        })
      );

      let notes = result.notes;
      if (itemsWithSuggestions.length === 0) {
        notes = 'Aucun aliment détecté clairement. Réessaie avec une photo plus nette ou ajoute manuellement.';
      } else if (notes.indexOf('Détection') === -1 && notes.indexOf('Vérifie') === -1) {
        notes = 'Détection IA terminée. Vérifie les aliments et ajuste les quantités.';
      }

      const payload: Record<string, unknown> = {
        ok: true,
        source: 'openrouter',
        items: itemsWithSuggestions,
        notes,
      };
      if (req.body?.dateKey) payload.dateKey = req.body.dateKey;

      return res.json(payload);
    } catch (e: unknown) {
      console.error('[meal-scan] unexpected error', e);
      res.status(500).json({
        ok: false,
        code: 'server_error',
        message: (e as Error).message,
      });
    }
  }
);

// POST /api/me/nutrition/logs/:dateKey — add one scan entry (confirmed items). Updates day totals.
router.post(
  '/nutrition/logs/:dateKey',
  [
    param('dateKey').matches(/^\d{4}-\d{2}-\d{2}$/),
    body('photoUrl').optional().isString(),
    body('items').isArray(),
    body('items.*.name').notEmpty(),
    body('items.*.grams').isNumeric(),
    body('items.*.kcal').isNumeric(),
    body('items.*.protein').isNumeric(),
    body('items.*.carbs').isNumeric(),
    body('items.*.fat').isNumeric(),
    body('items.*.foodId').optional().isString(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const err = validationResult(req);
      if (!err.isEmpty()) return res.status(400).json({ message: err.array()[0].msg });
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });
      const dateKey = req.params.dateKey as string;
      const date = parseDateKey(dateKey);
      const photoUrl = req.body.photoUrl;
      const items = (req.body.items || []).map((it: any) => ({
        foodId: it.foodId ? it.foodId : undefined,
        name: it.name,
        grams: Number(it.grams),
        kcal: Number(it.kcal),
        protein: Number(it.protein),
        carbs: Number(it.carbs),
        fat: Number(it.fat),
      }));

      let log = await DailyNutritionLog.findOne({ userId, date }).lean();
      const entryId = new (await import('mongoose')).default.Types.ObjectId();
      const newEntry = {
        entryId,
        source: 'scan' as const,
        photoUrl,
        items,
        createdAt: new Date(),
      };
      const entries = [...((log as any)?.entries || []), newEntry];

      const consumedCalories = entries.reduce((sum, e) => sum + (e.items || []).reduce((s: number, i: any) => s + (i.kcal || 0), 0), 0);
      const consumedMacros = entries.reduce(
        (acc, e) => {
          (e.items || []).forEach((i: any) => {
            acc.proteinG += i.protein || 0;
            acc.carbsG += i.carbs || 0;
            acc.fatG += i.fat || 0;
          });
          return acc;
        },
        { proteinG: 0, carbsG: 0, fatG: 0 }
      );

      const updated = await DailyNutritionLog.findOneAndUpdate(
        { userId, date },
        {
          $set: {
            consumedCalories,
            consumedMacros,
            entries,
          },
        },
        { upsert: true, new: true }
      );
      res.status(201).json({ log: updated, entryId: entryId.toString() });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// POST /api/me/nutrition/log
router.post(
  '/nutrition/log',
  [
    body('date').isISO8601(),
    body('consumedCalories').optional().isNumeric(),
    body('waterMl').optional().isNumeric(),
    body('consumedMacros').optional().isObject(),
    body('completedMealsIds').optional().isArray(),
    body('status').optional().isIn(['incomplete', 'complete']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const date = new Date((req.body.date as string).split('T')[0]);
      const update: any = {
        consumedCalories: req.body.consumedCalories,
        waterMl: req.body.waterMl,
        consumedMacros: req.body.consumedMacros,
        completedMealsIds: req.body.completedMealsIds,
        status: req.body.status || 'incomplete',
      };
      if (req.body.notes !== undefined) update.notes = req.body.notes;

      const log = await DailyNutritionLog.findOneAndUpdate(
        { userId, date },
        { $set: update },
        { upsert: true, new: true }
      );
      res.json({ log });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

/** YYYY-MM-DD from UTC calendar parts (aligned with /me/today civil dates). */
function dateToKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// GET /api/me/plan/week?weekNumber=1..5 — Mon–Sun weeks anchored to Monday of subscription week (same as /me/today)
router.get(
  '/plan/week',
  [query('weekNumber').isInt({ min: 1, max: 5 })],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const sub = await Subscription.findOne({
        userId,
        status: 'ACTIVE',
        endAt: { $gt: new Date() },
      }).populate('levelTemplateId');

      if (!sub) {
        return res.json({ plan: null, message: 'No active subscription' });
      }

      const weekNumber = parseInt(req.query.weekNumber as string, 10);
      const planStartMs = utcMondayStartOfWeekContaining(new Date((sub as any).startAt));
      const durationWeeks = 5;

      // Prefer coach-assigned ClientPlanOverride, fall back to subscription's levelTemplateId
      const planOverride = await ClientPlanOverride.findOne({ userId, status: 'active' }).lean();
      const levelId = planOverride
        ? (planOverride as any).baseLevelTemplateId
        : (sub as any).levelTemplateId?._id ?? (sub as any).levelTemplateId;
      const level = levelId ? await LevelTemplate.findById(levelId).lean() : null;
      const week = (level as any)?.weeks?.find((w: any) => w.weekNumber === weekNumber);
      const hasLevelTemplatePlan =
        !!level && Array.isArray((level as any).weeks) && (level as any).weeks.length > 0;
      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

      const sessionIds = new Set<string>();
      if (week) {
        for (const d of dayKeys) {
          for (const p of (week.days as any)?.[d] || []) {
            if (p.sessionTemplateId) sessionIds.add(p.sessionTemplateId.toString());
          }
        }
      }
      const sessions = await SessionTemplate.find({ _id: { $in: Array.from(sessionIds) } }).select('title durationMinutes').lean();
      const sessionMap = new Map(sessions.map((s: any) => [s._id.toString(), s]));

      const days: Array<{ day: string; date: string; dateKey: string; sessions: Array<{ sessionTemplateId: string; title?: string; durationMinutes?: number }> }> = [];
      for (let i = 0; i < 7; i++) {
        const offsetDays = (weekNumber - 1) * 7 + i;
        const dayStart = new Date(planStartMs + offsetDays * MS_PER_DAY);
        const y = dayStart.getUTCFullYear();
        const mo = dayStart.getUTCMonth();
        const d = dayStart.getUTCDate();
        const dayEnd = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));
        const dateKeyStr = dateToKeyUtc(dayStart);

        let sessionsForDay: Array<{ sessionTemplateId: string; title?: string; durationMinutes?: number }> = [];
        if (week) {
          const placements = (week.days as any)?.[dayKeys[i]] || [];
          sessionsForDay = placements
            .map((p: any) => {
              const id = p.sessionTemplateId != null ? String(p.sessionTemplateId) : null;
              const st = id ? sessionMap.get(id) : null;
              return { sessionTemplateId: id, title: (st as any)?.title, durationMinutes: (st as any)?.durationMinutes };
            })
            .filter((s: any) => s.sessionTemplateId);
        }
        // Stale DailyProgram rows (e.g. seed "Push B") must not override the admin template
        if (sessionsForDay.length === 0 && !hasLevelTemplatePlan) {
          const dailyProgram = await DailyProgram.findOne({
            userId,
            date: { $gte: dayStart, $lte: dayEnd },
          }).lean();
          if (dailyProgram && (dailyProgram as any).sessionTemplateId) {
            const st =
              sessionMap.get((dailyProgram as any).sessionTemplateId.toString()) ??
              (await SessionTemplate.findById((dailyProgram as any).sessionTemplateId).select('title durationMinutes').lean());
            if (st) {
              sessionsForDay = [
                {
                  sessionTemplateId: (st as any)._id.toString(),
                  title: (st as any).title,
                  durationMinutes: (st as any).durationMinutes,
                },
              ];
            }
          }
        }

        days.push({
          day: dayKeys[i],
          date: dayStart.toISOString().split('T')[0],
          dateKey: dateKeyStr,
          sessions: sessionsForDay,
        });
      }

      res.json({
        plan: {
          weekNumber,
          levelName: (sub as any).levelTemplateId?.name,
          planStartDate: (sub as any).startAt,
          planEndDate: (sub as any).endAt,
          durationWeeks,
          days,
        },
      });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /api/me/session/:sessionTemplateId
router.get(
  '/session/:sessionTemplateId',
  [param('sessionTemplateId').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await SessionTemplate.findById(req.params.sessionTemplateId)
        .populate('items.exerciseId', 'name muscleGroup equipment difficulty description videoUrl videoSource videoFilePath')
        .populate('items.alternatives', 'name muscleGroup equipment videoUrl')
        .lean();
      if (!session) return res.status(404).json({ message: 'Session not found' });
      res.json({ session });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /api/me/exercise/:exerciseId
router.get(
  '/exercise/:exerciseId',
  [param('exerciseId').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const exercise = await Exercise.findById(req.params.exerciseId).lean();
      if (!exercise) return res.status(404).json({ message: 'Exercise not found' });
      res.json({ exercise });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

// GET /api/me/recipes/favorites
router.get('/recipes/favorites', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const favs = await RecipeFavorite.find({ userId }).select('recipeId').lean();
    res.json({ recipeIds: favs.map((f: any) => f.recipeId.toString()) });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

// POST /api/me/recipes/favorites/:id
router.post('/recipes/favorites/:id', [param('id').isMongoId()], async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const recipeId = req.params.id;
    await RecipeFavorite.findOneAndUpdate(
      { userId, recipeId },
      { userId, recipeId },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

// DELETE /api/me/recipes/favorites/:id
router.delete('/recipes/favorites/:id', [param('id').isMongoId()], async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    await RecipeFavorite.deleteOne({ userId, recipeId: req.params.id });
    res.json({ ok: true });
  } catch (e: unknown) {
    res.status(500).json({ message: (e as Error).message });
  }
});

// POST /api/me/workout/session/complete — save a completed workout session from mobile
router.post(
  '/workout/session/complete',
  [body('sessionTemplateId').notEmpty(), body('exercises').isArray()],
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const {
        sessionTemplateId,
        durationSeconds = 0,
        exercises = [],
      }: {
        sessionTemplateId: string;
        durationSeconds?: number;
        exercises: Array<{
          exerciseId: string;
          exerciseName: string;
          sets: Array<{ setNumber: number; reps: number; weightKg: number; completedAt?: string }>;
        }>;
      } = req.body;

      // Build exercises with computed volumes
      const exercisesWithVolume = exercises.map((ex) => {
        const totalVolumeKg = ex.sets.reduce(
          (sum, s) => sum + (s.reps ?? 0) * (s.weightKg ?? 0),
          0
        );
        return {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName ?? '',
          status: 'completed' as const,
          sets: ex.sets.map((s, idx) => ({
            setNumber: s.setNumber ?? idx + 1,
            weight: s.weightKg ?? 0,
            repsCompleted: s.reps ?? 0,
            completed: true,
            completedAt: s.completedAt ? new Date(s.completedAt) : new Date(),
          })),
          totalVolumeKg,
          completedAt: new Date(),
        };
      });

      const totalSessionVolumeKg = exercisesWithVolume.reduce(
        (sum, ex) => sum + ex.totalVolumeKg,
        0
      );

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WorkoutSessionModel = require('../models/WorkoutSession.model').default;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ExerciseHistoryModel = require('../models/ExerciseHistory.model').default;
      const mongoose = require('mongoose');

      const session = await WorkoutSessionModel.create({
        userId,
        sessionId: new mongoose.Types.ObjectId(),
        date: new Date(),
        exercises: exercisesWithVolume,
        startedAt: new Date(Date.now() - durationSeconds * 1000),
        completedAt: new Date(),
        durationSeconds,
        totalSessionVolumeKg,
        status: 'completed',
        xpGained: 0,
      });

      // Upsert ExerciseHistory for each exercise
      for (const ex of exercisesWithVolume) {
        if (!ex.exerciseId) continue;
        const lastSet = ex.sets[ex.sets.length - 1];
        await ExerciseHistoryModel.findOneAndUpdate(
          { userId, exerciseId: ex.exerciseId },
          {
            $set: {
              lastWeight: lastSet?.weight ?? 0,
              lastReps: ex.sets.map((s) => s.repsCompleted ?? 0),
              lastSets: ex.sets,
              lastCompletedAt: new Date(),
              totalVolume: ex.totalVolumeKg,
              progressionStatus: 'stable',
            },
          },
          { upsert: true, new: true }
        );
      }

      res.json({ success: true, sessionId: session._id });
    } catch (e: unknown) {
      res.status(500).json({ message: (e as Error).message });
    }
  }
);

export default router;
