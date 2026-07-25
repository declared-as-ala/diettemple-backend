import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import LevelTemplate from '../../models/LevelTemplate.model';
import { AuthRequest } from '../../middleware/auth.middleware';
import { resolveWeekSessions, legacyDayKeyFromOffset } from '../../services/planSchedule.service';

const router = Router();
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function countWeekSessions(week: { days?: Record<string, unknown[]> }): number {
  return DAY_KEYS.reduce((sum, d) => sum + (week.days?.[d]?.length ?? 0), 0);
}

function validateWeeks(weeks: unknown[], expectedWeeks: number): { valid: boolean; message?: string } {
  if (!Array.isArray(weeks) || weeks.length !== expectedWeeks) {
    return { valid: false, message: `Exactly ${expectedWeeks} weeks required` };
  }
  const seen = new Set<number>();
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i] as Record<string, unknown>;
    const num = w?.weekNumber as number;
    if (num == null || num < 1 || num > expectedWeeks) {
      return { valid: false, message: `Week ${i + 1}: weekNumber must be 1–${expectedWeeks}` };
    }
    if (seen.has(num)) {
      return { valid: false, message: `Duplicate weekNumber: ${num}` };
    }
    seen.add(num);
  }
  return { valid: true };
}

// GET /level-templates
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('search').optional().isString(),
    query('active').optional().isIn(['true', 'false']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt((req.query.page as string) || '1');
      const limit = parseInt((req.query.limit as string) || '20');
      const skip = (page - 1) * limit;
      const filter: Record<string, unknown> = {};
      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { clientDisplayName: { $regex: req.query.search, $options: 'i' } },
          { description: { $regex: req.query.search, $options: 'i' } },
        ];
      }
      if (req.query.active === 'true') filter.isActive = true;
      if (req.query.active === 'false') filter.isActive = false;

      const [levelTemplates, total] = await Promise.all([
        LevelTemplate.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
        LevelTemplate.countDocuments(filter),
      ]);
      res.json({
        levelTemplates,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// GET /level-templates/:id
router.get(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const levelTemplate = await LevelTemplate.findById(req.params.id).lean();
      if (!levelTemplate) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      res.json({ levelTemplate });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// POST /level-templates
router.post(
  '/',
  [
    body('name').notEmpty().trim().isLength({ min: 2, max: 100 }).withMessage('Le nom interne du plan doit contenir entre 2 et 100 caractères.'),
    body('clientDisplayName').notEmpty().trim().isLength({ min: 2, max: 120 }).withMessage('Veuillez saisir le nom affiché au client.'),
    body('level').optional().isIn(['INITIATE', 'FIGHTER', 'WARRIOR', 'CHAMPION', 'ELITE']).withMessage('level must be one of: INITIATE, FIGHTER, WARRIOR, CHAMPION, ELITE'),
    body('description').optional().isString(),
    body('imageUrl').optional().isString(),
    body('isActive').optional().isBoolean(),
    body('gender').optional().isIn(['M', 'F']).withMessage('gender must be M or F'),
    body('minimumSessionsPerWeek').optional().isInt({ min: 1, max: 7 }).withMessage('minimumSessionsPerWeek must be 1-7'),
    body('maximumSessionsPerWeek').optional().isInt({ min: 1, max: 7 }).withMessage('maximumSessionsPerWeek must be 1-7'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const gender = req.body.gender ?? 'M';
      const existing = await LevelTemplate.findOne({ name: req.body.name.trim(), gender });
      if (existing) {
        return res.status(409).json({ message: `Un template "${req.body.name}" (${gender}) existe déjà.` });
      }

      const durationWeeks = req.body.durationWeeks ? Number(req.body.durationWeeks) : 5;
      const initialWeeks = Array.from({ length: durationWeeks }, (_, i) => ({
        weekNumber: i + 1,
        days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
      }));

      const plan = await LevelTemplate.create({
        name: req.body.name.trim(),
        clientDisplayName: req.body.clientDisplayName ? req.body.clientDisplayName.trim() : req.body.name.trim(),
        level: req.body.level || 'INITIATE',
        description: req.body.description,
        imageUrl: req.body.imageUrl,
        isActive: req.body.isActive !== false,
        gender,
        durationWeeks,
        minimumSessionsPerWeek: req.body.minimumSessionsPerWeek,
        maximumSessionsPerWeek: req.body.maximumSessionsPerWeek,
        divisions: req.body.divisions || [],
        weeks: initialWeeks,
      });
      res.status(201).json({ levelTemplate: plan.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// PUT /level-templates/:id
router.put(
  '/:id',
  [
    param('id').isMongoId(),
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Le nom interne du plan doit contenir entre 2 et 100 caractères.'),
    body('clientDisplayName').optional().trim().isLength({ min: 2, max: 120 }).withMessage('Le nom affiché au client doit contenir entre 2 et 120 caractères.'),
    body('level').optional().isIn(['INITIATE', 'FIGHTER', 'WARRIOR', 'CHAMPION', 'ELITE']).withMessage('level must be one of: INITIATE, FIGHTER, WARRIOR, CHAMPION, ELITE'),
    body('gender').optional().isIn(['M', 'F']).withMessage('gender must be M or F'),
    body('minimumSessionsPerWeek').optional().isInt({ min: 1, max: 7 }).withMessage('minimumSessionsPerWeek must be 1-7'),
    body('maximumSessionsPerWeek').optional().isInt({ min: 1, max: 7 }).withMessage('maximumSessionsPerWeek must be 1-7'),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const plan = await LevelTemplate.findById(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      if (req.body.name != null && req.body.name.trim() !== '') plan.name = req.body.name.trim();
      if (req.body.clientDisplayName != null && req.body.clientDisplayName.trim() !== '') plan.clientDisplayName = req.body.clientDisplayName.trim();
      if (req.body.level !== undefined) plan.level = req.body.level;
      if (req.body.description != null) plan.description = req.body.description;
      if (req.body.imageUrl !== undefined) plan.imageUrl = req.body.imageUrl;
      if (req.body.isActive != null) plan.isActive = req.body.isActive;
      if (req.body.gender !== undefined) plan.gender = req.body.gender;
      
      if (req.body.durationWeeks !== undefined) {
        const oldDuration = plan.durationWeeks || 5;
        const newDuration = Number(req.body.durationWeeks);
        plan.durationWeeks = newDuration;
        
        // Resize weeks array
        if (newDuration > oldDuration) {
          for (let w = oldDuration + 1; w <= newDuration; w++) {
            plan.weeks.push({
              weekNumber: w,
              days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
            });
          }
        } else if (newDuration < oldDuration) {
          plan.weeks = plan.weeks.filter((w: any) => w.weekNumber <= newDuration);
        }
      }

      if (req.body.minimumSessionsPerWeek !== undefined) plan.minimumSessionsPerWeek = req.body.minimumSessionsPerWeek;
      if (req.body.maximumSessionsPerWeek !== undefined) plan.maximumSessionsPerWeek = req.body.maximumSessionsPerWeek;
      if (req.body.divisions !== undefined) plan.divisions = req.body.divisions;

      await plan.save();
      res.json({ levelTemplate: plan.toObject() });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

/**
 * Builds the legacy `days.mon..sun` map from an ordered `sessions[]` array, so both
 * shapes always stay in sync server-side (offset % 7 -> DAY_KEYS[offset % 7]).
 */
function daysFromSessions(sessions: Array<{ sessionTemplateId: any; recommendedDayOffset: number }>) {
  const days: Record<(typeof DAY_KEYS)[number], Array<{ sessionTemplateId: any; order: number }>> = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
  };
  sessions.forEach((s, idx) => {
    const key = legacyDayKeyFromOffset(s.recommendedDayOffset);
    days[key].push({ sessionTemplateId: s.sessionTemplateId, order: idx });
  });
  return days;
}

// PUT /level-templates/:id/weeks
// Accepts weeks in either shape: the new ordered `sessions[]` (source of truth going
// forward) or the legacy `days.mon..sun` map. Whichever is provided, both are derived
// and stored, so every existing reader of `days{}` keeps working unchanged.
router.put(
  '/:id/weeks',
  [param('id').isMongoId(), body('weeks').isArray().withMessage('weeks must be an array')],
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await LevelTemplate.findById(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: 'Level template not found' });
      }

      const validation = validateWeeks(req.body.weeks, plan.durationWeeks || 5);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.message });
      }

      const weeks = req.body.weeks.map((w: Record<string, any>) => {
        const hasNewSessions = Array.isArray(w.sessions);
        const isRestWeek = !!w.isRestWeek;

        if (hasNewSessions) {
          const sessions = (w.sessions as any[])
            .filter((s) => s?.sessionTemplateId)
            .map((s, idx) => ({
              sessionTemplateId: s.sessionTemplateId,
              sessionOrder: s.sessionOrder ?? idx + 1,
              recommendedDayOffset: s.recommendedDayOffset ?? 0,
              restDaysAfterPrevious: s.restDaysAfterPrevious,
            }))
            .sort((a, b) => a.sessionOrder - b.sessionOrder);
          return {
            weekNumber: w.weekNumber,
            sessions,
            days: daysFromSessions(sessions),
            minimumCompletedSessions: isRestWeek ? 0 : (w.minimumCompletedSessions ?? sessions.length),
            isRestWeek,
          };
        }

        // Legacy caller: only `days{}` provided. Store it as-is and derive `sessions[]`
        // so week-progress/catch-up services still schedule correctly for this week.
        const days = {
          mon: (w.days?.mon || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
          tue: (w.days?.tue || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
          wed: (w.days?.wed || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
          thu: (w.days?.thu || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
          fri: (w.days?.fri || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
          sat: (w.days?.sat || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
          sun: (w.days?.sun || []).map((p: any) => ({ sessionTemplateId: p.sessionTemplateId, note: p.note, order: p.order, divisionId: p.divisionId })),
        };
        const derivedSessions = resolveWeekSessions({ weekNumber: w.weekNumber, days } as any);
        return {
          weekNumber: w.weekNumber,
          days,
          sessions: derivedSessions.length > 0 ? derivedSessions : undefined,
          minimumCompletedSessions: isRestWeek ? 0 : (w.minimumCompletedSessions ?? (derivedSessions.length || undefined)),
          isRestWeek,
        };
      });
      plan.weeks = weeks;
      await plan.save();
      res.json({ levelTemplate: plan.toObject() });
    } catch (err: unknown) {
      if ((err as any)?.name === 'ValidationError') {
        return res.status(400).json({ message: (err as Error).message });
      }
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

// DELETE /level-templates/:id
router.delete(
  '/:id',
  [param('id').isMongoId()],
  async (req: AuthRequest, res: Response) => {
    try {
      const plan = await LevelTemplate.findByIdAndDelete(req.params.id);
      if (!plan) {
        return res.status(404).json({ message: 'Level template not found' });
      }
      res.json({ message: 'Level template deleted' });
    } catch (err: unknown) {
      res.status(500).json({ message: (err as Error).message });
    }
  }
);

export default router;
