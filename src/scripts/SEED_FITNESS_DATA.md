# Fitness Data Seeder

## Overview

This seeder creates a complete, production-ready fitness database with:
- **21 exercises** with video URLs, equipment types, and difficulty levels
- **5 workout sessions** (Chest, Back, Legs, Shoulders, Arms) with exercise configurations
- **Alternatives** for each exercise (1-3 max, stored in database)
- **6-week workout plan** assigned to `test@test.com`
- **42 daily programs** (one per day for 6 weeks)

## What Gets Seeded

### 1. Exercises (21 total)

#### Chest (5 exercises)
- Barbell Bench Press (barbell, intermediate)
- Machine Chest Press (machine, beginner)
- Dumbbell Bench Press (dumbbell, intermediate)
- Incline Dumbbell Press (dumbbell, intermediate)
- Cable Fly (cable, beginner)

#### Back (4 exercises)
- Lat Pulldown (machine, beginner)
- Pull-ups (bodyweight, intermediate)
- Seated Cable Row (cable, beginner)
- One-arm Dumbbell Row (dumbbell, intermediate)

#### Legs (4 exercises)
- Squat (barbell, intermediate)
- Leg Press (machine, beginner)
- Leg Extension (machine, beginner)
- Lying Leg Curl (machine, beginner)

#### Shoulders (4 exercises)
- Shoulder Press Machine (machine, beginner)
- Dumbbell Shoulder Press (dumbbell, intermediate)
- Lateral Raises (dumbbell, beginner)
- Rear Delt Fly (dumbbell, beginner)

#### Arms (4 exercises)
- Barbell Curl (barbell, beginner)
- Dumbbell Curl (dumbbell, beginner)
- Triceps Pushdown (cable, beginner)
- Skull Crushers (barbell, intermediate)

### 2. Workout Sessions

Each session includes:
- **Exercise configurations** with alternatives
- **Sets, reps ranges, rest times**
- **Recommended starting weights**
- **Progression rules** (coach-defined)

#### Sessions Created:
1. **Chest Day** (60 min, intermediate)
   - Bench Press → alternatives: Machine Chest Press, Dumbbell Bench Press
   - Incline Dumbbell Press → alternatives: Dumbbell Bench Press
   - Cable Fly
   - Triceps Pushdown → alternatives: Skull Crushers

2. **Back Day** (60 min, intermediate)
   - Lat Pulldown → alternatives: Pull-ups
   - Seated Cable Row → alternatives: One-arm Dumbbell Row
   - One-arm Dumbbell Row → alternatives: Seated Cable Row
   - Barbell Curl → alternatives: Dumbbell Curl

3. **Leg Day** (75 min, intermediate)
   - Squat → alternatives: Leg Press
   - Leg Press → alternatives: Squat
   - Leg Extension
   - Lying Leg Curl

4. **Shoulder Day** (45 min, intermediate)
   - Shoulder Press Machine → alternatives: Dumbbell Shoulder Press
   - Lateral Raises
   - Rear Delt Fly

5. **Arm Day** (45 min, intermediate)
   - Barbell Curl → alternatives: Dumbbell Curl
   - Dumbbell Curl → alternatives: Barbell Curl
   - Skull Crushers → alternatives: Triceps Pushdown
   - Triceps Pushdown → alternatives: Skull Crushers

### 3. Weekly Template

**Schedule:**
- Monday: Chest Day
- Tuesday: Back Day
- Wednesday: Rest
- Thursday: Shoulder Day
- Friday: Leg Day
- Saturday: Rest
- Sunday: Arm Day

### 4. Program Assignment

- **User:** test@test.com
- **Start Date:** Monday of current week
- **Duration:** 6 weeks (42 days)
- **Status:** ACTIVE
- **Level:** Intiate (reset to initial level)

### 5. Daily Programs

- **42 daily programs** generated (one per day for 6 weeks)
- Progressive water and calorie targets
- Weekly objectives that change every 2 weeks

## Video URLs

All exercises have placeholder video URLs in the format:
```
/videos/exercises/{muscle-group}/{exercise-name}.mp4
```

Example:
- `/videos/exercises/chest/barbell-bench-press.mp4`
- `/videos/exercises/back/lat-pulldown.mp4`

**Note:** These are placeholders. Replace with actual video files later.

## Progression Rules

Example progression rule (for Bench Press):
- If reps ≥ 12 → suggest +2.5kg increase
- If reps ≤ 5 → suggest -2.5kg decrease for safety

These are coach-defined and stored in `SessionExerciseConfig`.

## Usage

### Run the Seeder

```bash
cd backend
npm run seed:fitness
```

### Test User Credentials

- **Email:** test@test.com
- **Password:** password123
- **Level:** Intiate

### What Happens

1. Clears existing fitness data (exercises, sessions, programs)
2. Creates/updates test user
3. Seeds all exercises with videos
4. Creates workout sessions with exercise configurations
5. Creates weekly template
6. Assigns 6-week program to test user
7. Generates 42 daily programs

## Database Structure

### Exercise Model
- `name`, `muscleGroup`, `equipment`, `difficulty`
- `videoUrl` (placeholder path)
- `sets`, `reps`, `restTime`, `description`

### SessionExerciseConfig Model
- `exerciseId` (main exercise)
- `alternatives` (1-3 exercise IDs)
- `sets`, `targetReps` (number or range)
- `restTime`, `recommendedStartingWeight`
- `progressionRules` (coach-defined)
- `order` (in session)

### Session Model
- `title`, `description`, `duration`, `difficulty`
- `exerciseConfigs` (array of SessionExerciseConfig IDs)
- `exercises` (legacy support)

### WeeklyTemplate Model
- `name`
- `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday` (Session IDs or null)

### Program Model
- `userId`, `startDate`, `durationWeeks`
- `weeklyTemplateId`
- `status` (ACTIVE, COMPLETED, PAUSED)

### DailyProgram Model
- `date`, `userId`, `weekNumber`
- `sessionId` (Session ID or null for rest days)
- `waterTarget`, `calorieTarget`, `dailyGoal`
- `completed`, `mainObjective`

## Important Notes

1. **No Hardcoded Weights:** Recommended starting weights are suggestions. Actual weights are user-specific and tracked in `ExerciseHistory`.

2. **Alternatives Stored in DB:** Alternatives are stored in `SessionExerciseConfig`, not calculated in frontend.

3. **Progressive Overload:** Logic is handled at runtime based on user performance, not seeded.

4. **Video Placeholders:** All video URLs are placeholders. Replace with actual video files.

5. **Realistic Data:** All exercises, sets, reps, and rest times follow real gym logic.

## Next Steps After Seeding

1. Login with `test@test.com` / `password123`
2. Check Home screen for today's session
3. Start workout to see TikTok-style exercise cards
4. Swipe up to see alternatives
5. Track sets with smart recommendations
6. Complete sessions to see progression

## Resetting Data

To reset and re-seed:
```bash
npm run seed:fitness
```

This will clear existing fitness data and create fresh seed data.
