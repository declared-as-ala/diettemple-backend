import { durationFromPlan } from './planAssignmentLifecycle.service';

describe('durationFromPlan', () => {
  it('derives duration from the actual plan weeks', () => {
    expect(durationFromPlan({ durationWeeks: 5, weeks: [{}, {}, {}, {}, {}, {}] })).toBe(6);
  });

  it('supports legacy templates that have a valid explicit duration', () => {
    expect(durationFromPlan({ durationWeeks: 8 })).toBe(8);
  });

  it('rejects plans without a valid duration', () => {
    expect(() => durationFromPlan({ weeks: [] })).toThrow('Plan template has no valid weeks');
  });
});
