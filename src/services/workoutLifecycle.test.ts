/**
 * Comprehensive Automated Tests for DietTemple Workout Lifecycle & Rattrapage Logic:
 *
 * - Scenario A: User completes today's workout -> completed ✓, no missed alert, no rattrapage.
 * - Scenario B: User misses Monday during current week -> Tuesday: Monday appears as rattrapage.
 * - Scenario C: User completes Monday's rattrapage on Wednesday -> Monday completed, rattrapage disappears.
 * - Scenario D: Monday and Wednesday missed -> Friday: Monday first, Wednesday second. After Monday completion -> Wednesday becomes next.
 * - Scenario E: Workout from Week 2 remains missed. User enters Week 3 -> Week 2 remains missed in history, but NO Week 2 rattrapage appears.
 * - Scenario F: Program starts Friday -> Week 1: Fri, Sat, Sun. Week 2: Mon..Sun.
 */
jest.mock('../models/WorkoutSession.model', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));

import { describe, it, expect, beforeEach } from '@jest/globals';
import WorkoutSession from '../models/WorkoutSession.model';
import { findOverdueSessions, findMostRecentOverdueSession } from './catchUp.service';
import { getProgramWeekDates, utcDateKey } from '../utils/scheduleDate';
import type { ILevelTemplate } from '../models/LevelTemplate.model';

describe('Workout Lifecycle & Rattrapage Rules (Scenarios A through F)', () => {
  const userId = 'user-123';
  // Plan starts on Monday 2026-09-14
  const planStart = new Date('2026-09-14T00:00:00.000Z');
  const durationWeeks = 5;

  const sampleLevelDoc: Pick<ILevelTemplate, 'weeks' | 'catchUpWindowHours'> = {
    catchUpWindowHours: 48,
    weeks: [
      {
        weekNumber: 1,
        days: {
          mon: [{ sessionTemplateId: 'session-w1-mon' as any }],
          wed: [{ sessionTemplateId: 'session-w1-wed' as any }],
          fri: [{ sessionTemplateId: 'session-w1-fri' as any }],
        } as any,
      } as any,
      {
        weekNumber: 2,
        days: {
          mon: [{ sessionTemplateId: 'session-w2-mon' as any }],
          wed: [{ sessionTemplateId: 'session-w2-wed' as any }],
          fri: [{ sessionTemplateId: 'session-w2-fri' as any }],
        } as any,
      } as any,
      {
        weekNumber: 3,
        days: {
          mon: [{ sessionTemplateId: 'session-w3-mon' as any }],
          wed: [{ sessionTemplateId: 'session-w3-wed' as any }],
          fri: [{ sessionTemplateId: 'session-w3-fri' as any }],
        } as any,
      } as any,
    ] as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockCompletedSessions(completedList: Array<{
    sessionId: string;
    date: Date;
    completionType?: string;
    originalScheduledDate?: Date;
  }>) {
    (WorkoutSession.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(completedList),
      }),
    });
  }

  describe('Scenario A: User completes today workout', () => {
    it('completed ✓, no missed alert, no rattrapage', async () => {
      // Wednesday of Week 1 (2026-09-16)
      const now = new Date('2026-09-16T18:00:00.000Z');
      mockCompletedSessions([
        {
          sessionId: 'session-w1-mon',
          date: new Date('2026-09-14T18:00:00.000Z'),
        },
        {
          sessionId: 'session-w1-wed',
          date: new Date('2026-09-16T18:00:00.000Z'),
        },
      ]);

      const overdue = await findOverdueSessions({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });

      expect(overdue).toEqual([]);
      const actionable = await findMostRecentOverdueSession({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });
      expect(actionable).toBeNull();
    });
  });

  describe('Scenario B: User misses Monday during current week', () => {
    it('On Tuesday, Monday appears as rattrapage', async () => {
      // Tuesday of Week 1 (2026-09-15) — Monday was not completed
      const now = new Date('2026-09-15T10:00:00.000Z');
      mockCompletedSessions([]);

      const overdue = await findOverdueSessions({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });

      expect(overdue.length).toBe(1);
      expect(overdue[0].sessionTemplateId).toBe('session-w1-mon');
      expect(overdue[0].originalDate).toBe('2026-09-14');
    });
  });

  describe('Scenario C: User completes Monday rattrapage on Wednesday', () => {
    it('Monday is completed, rattrapage disappears', async () => {
      // Wednesday of Week 1 (2026-09-16). Monday was recovered via rattrapage.
      const now = new Date('2026-09-16T10:00:00.000Z');
      mockCompletedSessions([
        {
          sessionId: 'session-w1-mon',
          date: new Date('2026-09-16T09:00:00.000Z'),
          completionType: 'rattrapage',
          originalScheduledDate: new Date('2026-09-14T00:00:00.000Z'),
        },
      ]);

      const overdue = await findOverdueSessions({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });

      // Monday rattrapage must disappear completely
      expect(overdue).toEqual([]);
    });
  });

  describe('Scenario D: Monday and Wednesday missed', () => {
    it('On Friday: Monday first, Wednesday second. After Monday completion: Wednesday becomes next', async () => {
      // Friday of Week 1 (2026-09-18)
      const now = new Date('2026-09-18T10:00:00.000Z');

      // Neither Monday nor Wednesday completed
      mockCompletedSessions([]);
      let overdue = await findOverdueSessions({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });

      // Must be sorted oldest first: Monday first, Wednesday second
      expect(overdue.length).toBe(2);
      expect(overdue[0].sessionTemplateId).toBe('session-w1-mon');
      expect(overdue[1].sessionTemplateId).toBe('session-w1-wed');

      let actionable = await findMostRecentOverdueSession({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });
      expect(actionable?.sessionTemplateId).toBe('session-w1-mon');

      // Now user completes Monday
      mockCompletedSessions([
        {
          sessionId: 'session-w1-mon',
          date: new Date('2026-09-18T11:00:00.000Z'),
          completionType: 'rattrapage',
          originalScheduledDate: new Date('2026-09-14T00:00:00.000Z'),
        },
      ]);

      overdue = await findOverdueSessions({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });

      expect(overdue.length).toBe(1);
      expect(overdue[0].sessionTemplateId).toBe('session-w1-wed');

      actionable = await findMostRecentOverdueSession({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });
      expect(actionable?.sessionTemplateId).toBe('session-w1-wed');
    });
  });

  describe('Scenario E: Workout from Week 2 remains missed, user enters Week 3', () => {
    it('Week 2 workout remains in history, but NO Week 2 rattrapage appears in Week 3', async () => {
      // Week 2 ran from 2026-09-21 to 2026-09-27. Friday session was missed.
      // Now it is Tuesday of Week 3 (2026-09-29)
      const now = new Date('2026-09-29T10:00:00.000Z');

      // Only Monday of Week 3 was completed, Week 2 Friday was NEVER completed
      mockCompletedSessions([
        {
          sessionId: 'session-w3-mon',
          date: new Date('2026-09-28T18:00:00.000Z'),
        },
      ]);

      const overdue = await findOverdueSessions({
        userId,
        levelDoc: sampleLevelDoc,
        planStart,
        durationWeeks,
        now,
      });

      // Week 2 Friday must NEVER appear as a rattrapage during Week 3!
      const week2Rattrapages = overdue.filter((s) => s.weekNumber === 2);
      expect(week2Rattrapages).toEqual([]);
      expect(overdue).toEqual([]);
    });
  });

  describe('Scenario F: Partial Week 1 starting Friday', () => {
    it('Allocates only remaining days for Week 1, Monday start for Week 2', () => {
      const fridayPlanStart = new Date('2026-09-18T00:00:00.000Z');
      const week1Dates = getProgramWeekDates(fridayPlanStart, 1);
      expect(week1Dates.map(utcDateKey)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20']);

      const week2Dates = getProgramWeekDates(fridayPlanStart, 2);
      expect(week2Dates.map(utcDateKey)).toEqual([
        '2026-09-21',
        '2026-09-22',
        '2026-09-23',
        '2026-09-24',
        '2026-09-25',
        '2026-09-26',
        '2026-09-27',
      ]);
    });
  });
});
