/**
 * Seed level templates. Initiate = 5-week PPL plan (deterministic).
 * Other levels (Fighter, Warrior, Champion, Elite) = random 5 weeks 4–7 sessions.
 * Upsert by name. Requires session templates.
 */
import LevelTemplate from '../models/LevelTemplate.model';
import SessionTemplate from '../models/SessionTemplate.model';
import { runSeed } from './runSeed';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export async function seedLevelTemplates(): Promise<number> {
  const sessions = await SessionTemplate.find().select('_id title').lean();
  const byTitle = new Map<string, any>();
  sessions.forEach((s: any) => byTitle.set(s.title, s._id));

  const required = [
    'Push A (Chest Focus)',
    'Push B (Shoulder Focus)',
    'Pull A (Back Width)',
    'Pull B (Back Thickness)',
    'Legs A (Quads Focus)',
    'Legs B (Posterior Chain Focus)',
    'Rest / Mobility (Optional)',
  ];
  const missing = required.filter((t) => !byTitle.has(t));
  if (missing.length > 0) {
    throw new Error(`Missing session templates (run seed:sessions first): ${missing.join(', ')}`);
  }

  const get = (title: string) => byTitle.get(title)!;
  const place = (title: string, order = 0) => ({ sessionTemplateId: get(title), order });

  // --- Initiate: 5-week PPL plan ---
  const initiateWeeks = [
    // Week 1: 4 sessions (P/P/L + optional mobility)
    {
      weekNumber: 1,
      days: {
        mon: [place('Push A (Chest Focus)')],
        tue: [place('Pull A (Back Width)')],
        wed: [place('Rest / Mobility (Optional)')],
        thu: [place('Legs A (Quads Focus)')],
        fri: [],
        sat: [],
        sun: [],
      },
    },
    // Week 2: 5 sessions (+ Push B)
    {
      weekNumber: 2,
      days: {
        mon: [place('Push A (Chest Focus)')],
        tue: [place('Pull A (Back Width)')],
        wed: [],
        thu: [place('Legs A (Quads Focus)')],
        fri: [place('Push B (Shoulder Focus)')],
        sat: [],
        sun: [],
      },
    },
    // Week 3: 5 sessions (+ Pull B)
    {
      weekNumber: 3,
      days: {
        mon: [place('Push A (Chest Focus)')],
        tue: [place('Pull A (Back Width)')],
        wed: [],
        thu: [place('Legs A (Quads Focus)')],
        fri: [],
        sat: [place('Pull B (Back Thickness)')],
        sun: [],
      },
    },
    // Week 4: 6 sessions (+ Push B + Pull B)
    {
      weekNumber: 4,
      days: {
        mon: [place('Push A (Chest Focus)')],
        tue: [place('Pull A (Back Width)')],
        wed: [],
        thu: [place('Legs A (Quads Focus)')],
        fri: [place('Push B (Shoulder Focus)')],
        sat: [place('Pull B (Back Thickness)')],
        sun: [],
      },
    },
    // Week 5: 4 sessions (deload)
    {
      weekNumber: 5,
      days: {
        mon: [place('Push A (Chest Focus)')],
        tue: [place('Pull A (Back Width)')],
        wed: [],
        thu: [place('Legs A (Quads Focus)')],
        fri: [],
        sat: [place('Rest / Mobility (Optional)')],
        sun: [],
      },
    },
  ];

  let created = 0;
  let updated = 0;

  const initiateBefore = await LevelTemplate.findOne({ name: 'Initiate' });
  const initiate = await LevelTemplate.findOneAndUpdate(
    { name: 'Initiate' },
    {
      $set: {
        name: 'Initiate',
        description: '5-week Push / Pull / Legs plan. Build base strength and consistency.',
        isActive: true,
        weeks: initiateWeeks,
      },
    },
    { upsert: true, new: true }
  );
  if (!initiateBefore) created++;
  else updated++;

  // Other levels: random 4–7 sessions per week (keep for dashboard variety)
  const otherNames = ['Fighter', 'Warrior', 'Champion', 'Elite'];
  const sessionIds = sessions.map((s: any) => s._id);

  function pickSessions(n: number): any[] {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        sessionTemplateId: sessionIds[Math.floor(Math.random() * sessionIds.length)],
        order: i,
      });
    }
    return out;
  }

  function buildRandomWeek(weekNumber: number): any {
    const totalSessions = 4 + Math.floor(Math.random() * 4);
    const days: Record<string, any[]> = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    let placed = 0;
    const order = [...DAY_KEYS].sort(() => Math.random() - 0.5);
    for (const d of order) {
      if (placed >= totalSessions) break;
      const n = Math.min(placed + 2 <= totalSessions && Math.random() > 0.5 ? 2 : 1, totalSessions - placed);
      days[d] = pickSessions(n);
      placed += n;
    }
    return { weekNumber, days };
  }

  for (const name of otherNames) {
    const existing = await LevelTemplate.findOne({ name });
    const weeks = [1, 2, 3, 4, 5].map(buildRandomWeek);
    if (existing) {
      existing.description = `Programme niveau ${name} - 5 semaines`;
      existing.isActive = true;
      existing.weeks = weeks;
      await existing.save();
      updated++;
    } else {
      await LevelTemplate.create({
        name,
        description: `Programme niveau ${name} - 5 semaines`,
        isActive: true,
        weeks,
      });
      created++;
    }
  }

  console.log(`✅ Level templates: ${created} created, ${updated} updated (Initiate = PPL 5 weeks)`);
  return 1 + otherNames.length;
}

if (require.main === module) {
  runSeed('level-templates', seedLevelTemplates)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
