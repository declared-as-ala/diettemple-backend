import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import User from '../models/User.model';
import Exercise from '../models/Exercise.model';
import Session from '../models/Session.model';
import SessionExerciseConfig from '../models/SessionExerciseConfig.model';
import DailyProgram from '../models/DailyProgram.model';
import WeeklyTemplate from '../models/WeeklyTemplate.model';
import Program from '../models/Program.model';
import BodyProgressPhoto from '../models/BodyProgressPhoto.model';
import CoachEvent from '../models/CoachEvent.model';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

async function seedFitnessData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await BodyProgressPhoto.deleteMany({});
    await CoachEvent.deleteMany({});
    await SessionExerciseConfig.deleteMany({});
    await DailyProgram.deleteMany({});
    await Program.deleteMany({});
    await WeeklyTemplate.deleteMany({});
    await Session.deleteMany({});
    await Exercise.deleteMany({});
    console.log('✅ Cleared existing data');

    // Find or create test user
    console.log('👤 Setting up test user...');
    let testUser = await User.findOne({ email: 'test@test.com' });
    
    if (!testUser) {
      const passwordHash = await bcrypt.hash('password123', 10);
      testUser = await User.create({
        email: 'test@test.com',
        passwordHash,
        name: 'Test User',
        level: 'Intiate',
        xp: 0,
        objectif: 'Gain muscle',
      });
      console.log('✅ Created test user');
    } else {
      // Reset user to initial state
      testUser.level = 'Intiate';
      testUser.xp = 0;
      await testUser.save();
      console.log('✅ Test user already exists, reset to Initiate level');
    }

    // ==================== 1. EXERCISE SEEDING ====================
    console.log('\n🏋️ Creating exercises with videos and alternatives...');

    // CHEST EXERCISES
    const benchPress = await Exercise.create({
      name: 'Barbell Bench Press',
      muscleGroup: 'Chest',
      equipment: 'barbell',
      difficulty: 'intermediate',
      sets: 4,
      reps: 10,
      restTime: 90,
      description: 'Compound exercise targeting pectorals, anterior deltoids, and triceps',
      videoUrl: '/videos/exercises/chest/barbell-bench-press.mp4',
    });

    const machineChestPress = await Exercise.create({
      name: 'Machine Chest Press',
      muscleGroup: 'Chest',
      equipment: 'machine',
      difficulty: 'beginner',
      sets: 3,
      reps: 12,
      restTime: 60,
      description: 'Machine-based chest press, great alternative when bench is busy',
      videoUrl: '/videos/exercises/chest/machine-chest-press.mp4',
    });

    const dumbbellBenchPress = await Exercise.create({
      name: 'Dumbbell Bench Press',
      muscleGroup: 'Chest',
      equipment: 'dumbbell',
      difficulty: 'intermediate',
      sets: 4,
      reps: 10,
      restTime: 90,
      description: 'Dumbbell variation for better range of motion',
      videoUrl: '/videos/exercises/chest/dumbbell-bench-press.mp4',
    });

    const inclineDumbbellPress = await Exercise.create({
      name: 'Incline Dumbbell Press',
      muscleGroup: 'Chest',
      equipment: 'dumbbell',
      difficulty: 'intermediate',
      sets: 3,
      reps: 12,
      restTime: 60,
      description: 'Targets upper chest muscles',
      videoUrl: '/videos/exercises/chest/incline-dumbbell-press.mp4',
    });

    const cableFly = await Exercise.create({
      name: 'Cable Fly',
      muscleGroup: 'Chest',
      equipment: 'cable',
      difficulty: 'beginner',
      sets: 3,
      reps: 15,
      restTime: 45,
      description: 'Isolation exercise for chest definition',
      videoUrl: '/videos/exercises/chest/cable-fly.mp4',
    });

    // BACK EXERCISES
    const latPulldown = await Exercise.create({
      name: 'Lat Pulldown',
      muscleGroup: 'Back',
      equipment: 'machine',
      difficulty: 'beginner',
      sets: 4,
      reps: 10,
      restTime: 90,
      description: 'Targets latissimus dorsi and biceps',
      videoUrl: '/videos/exercises/back/lat-pulldown.mp4',
    });

    const pullUps = await Exercise.create({
      name: 'Pull-ups',
      muscleGroup: 'Back',
      equipment: 'bodyweight',
      difficulty: 'intermediate',
      sets: 3,
      reps: 10,
      restTime: 60,
      description: 'Bodyweight exercise for back and biceps',
      videoUrl: '/videos/exercises/back/pull-ups.mp4',
    });

    const seatedCableRow = await Exercise.create({
      name: 'Seated Cable Row',
      muscleGroup: 'Back',
      equipment: 'cable',
      difficulty: 'beginner',
      sets: 4,
      reps: 12,
      restTime: 90,
      description: 'Targets middle back and rhomboids',
      videoUrl: '/videos/exercises/back/seated-cable-row.mp4',
    });

    const oneArmDumbbellRow = await Exercise.create({
      name: 'One-arm Dumbbell Row',
      muscleGroup: 'Back',
      equipment: 'dumbbell',
      difficulty: 'intermediate',
      sets: 3,
      reps: 12,
      restTime: 60,
      description: 'Unilateral back exercise',
      videoUrl: '/videos/exercises/back/one-arm-dumbbell-row.mp4',
    });

    // LEGS EXERCISES
    const squat = await Exercise.create({
      name: 'Squat',
      muscleGroup: 'Legs',
      equipment: 'barbell',
      difficulty: 'intermediate',
      sets: 4,
      reps: 12,
      restTime: 90,
      description: 'King of leg exercises, targets quads, glutes, and hamstrings',
      videoUrl: '/videos/exercises/legs/squat.mp4',
    });

    const legPress = await Exercise.create({
      name: 'Leg Press',
      muscleGroup: 'Legs',
      equipment: 'machine',
      difficulty: 'beginner',
      sets: 4,
      reps: 15,
      restTime: 60,
      description: 'Machine-based leg exercise',
      videoUrl: '/videos/exercises/legs/leg-press.mp4',
    });

    const legExtension = await Exercise.create({
      name: 'Leg Extension',
      muscleGroup: 'Legs',
      equipment: 'machine',
      difficulty: 'beginner',
      sets: 3,
      reps: 15,
      restTime: 45,
      description: 'Isolation exercise for quadriceps',
      videoUrl: '/videos/exercises/legs/leg-extension.mp4',
    });

    const lyingLegCurl = await Exercise.create({
      name: 'Lying Leg Curl',
      muscleGroup: 'Legs',
      equipment: 'machine',
      difficulty: 'beginner',
      sets: 3,
      reps: 12,
      restTime: 45,
      description: 'Targets hamstrings',
      videoUrl: '/videos/exercises/legs/lying-leg-curl.mp4',
    });

    // SHOULDERS EXERCISES
    const shoulderPressMachine = await Exercise.create({
      name: 'Shoulder Press Machine',
      muscleGroup: 'Shoulders',
      equipment: 'machine',
      difficulty: 'beginner',
      sets: 4,
      reps: 10,
      restTime: 60,
      description: 'Machine-based shoulder press',
      videoUrl: '/videos/exercises/shoulders/shoulder-press-machine.mp4',
    });

    const dumbbellShoulderPress = await Exercise.create({
      name: 'Dumbbell Shoulder Press',
      muscleGroup: 'Shoulders',
      equipment: 'dumbbell',
      difficulty: 'intermediate',
      sets: 4,
      reps: 10,
      restTime: 60,
      description: 'Free weight shoulder press',
      videoUrl: '/videos/exercises/shoulders/dumbbell-shoulder-press.mp4',
    });

    const lateralRaises = await Exercise.create({
      name: 'Lateral Raises',
      muscleGroup: 'Shoulders',
      equipment: 'dumbbell',
      difficulty: 'beginner',
      sets: 3,
      reps: 15,
      restTime: 45,
      description: 'Isolation exercise for lateral deltoids',
      videoUrl: '/videos/exercises/shoulders/lateral-raises.mp4',
    });

    const rearDeltFly = await Exercise.create({
      name: 'Rear Delt Fly',
      muscleGroup: 'Shoulders',
      equipment: 'dumbbell',
      difficulty: 'beginner',
      sets: 3,
      reps: 15,
      restTime: 45,
      description: 'Targets posterior deltoids',
      videoUrl: '/videos/exercises/shoulders/rear-delt-fly.mp4',
    });

    // ARMS EXERCISES
    const barbellCurl = await Exercise.create({
      name: 'Barbell Curl',
      muscleGroup: 'Arms',
      equipment: 'barbell',
      difficulty: 'beginner',
      sets: 3,
      reps: 12,
      restTime: 45,
      description: 'Bicep exercise with barbell',
      videoUrl: '/videos/exercises/arms/barbell-curl.mp4',
    });

    const dumbbellCurl = await Exercise.create({
      name: 'Dumbbell Curl',
      muscleGroup: 'Arms',
      equipment: 'dumbbell',
      difficulty: 'beginner',
      sets: 3,
      reps: 12,
      restTime: 45,
      description: 'Bicep exercise with dumbbells',
      videoUrl: '/videos/exercises/arms/dumbbell-curl.mp4',
    });

    const tricepsPushdown = await Exercise.create({
      name: 'Triceps Pushdown',
      muscleGroup: 'Arms',
      equipment: 'cable',
      difficulty: 'beginner',
      sets: 3,
      reps: 12,
      restTime: 45,
      description: 'Cable tricep exercise',
      videoUrl: '/videos/exercises/arms/triceps-pushdown.mp4',
    });

    const skullCrushers = await Exercise.create({
      name: 'Skull Crushers',
      muscleGroup: 'Arms',
      equipment: 'barbell',
      difficulty: 'intermediate',
      sets: 3,
      reps: 12,
      restTime: 45,
      description: 'Tricep isolation exercise',
      videoUrl: '/videos/exercises/arms/skull-crushers.mp4',
    });

    console.log(`✅ Created ${await Exercise.countDocuments()} exercises`);

    // ==================== 2. SESSION SEEDING WITH EXERCISE CONFIGS ====================
    console.log('\n📋 Creating workout sessions with exercise configurations...');

    // CHEST DAY - with alternatives
    const chestDayConfigs = [];
    
    // Bench Press with alternatives
    const benchPressConfig = await SessionExerciseConfig.create({
      exerciseId: benchPress._id,
      alternatives: [machineChestPress._id, dumbbellBenchPress._id],
      sets: 4,
      targetReps: { min: 8, max: 12 },
      restTime: 90,
      recommendedStartingWeight: 60,
      progressionRules: [
        {
          condition: 'reps_above',
          value: 12,
          action: 'increase_weight',
          weightChange: 2.5,
          message: '💪 Augmenter le poids de 2.5kg pour la prochaine série',
        },
        {
          condition: 'reps_below',
          value: 5,
          action: 'decrease_weight',
          weightChange: 2.5,
          message: '⚠️ Réduire le poids pour la sécurité',
        },
      ],
      order: 0,
    });
    chestDayConfigs.push(benchPressConfig._id);

    // Incline Dumbbell Press
    const inclineConfig = await SessionExerciseConfig.create({
      exerciseId: inclineDumbbellPress._id,
      alternatives: [dumbbellBenchPress._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 60,
      recommendedStartingWeight: 20,
      order: 1,
    });
    chestDayConfigs.push(inclineConfig._id);

    // Cable Fly
    const cableFlyConfig = await SessionExerciseConfig.create({
      exerciseId: cableFly._id,
      alternatives: [],
      sets: 3,
      targetReps: { min: 12, max: 15 },
      restTime: 45,
      recommendedStartingWeight: 15,
      order: 2,
    });
    chestDayConfigs.push(cableFlyConfig._id);

    // Triceps Pushdown (for chest day)
    const tricepsPushdownConfig1 = await SessionExerciseConfig.create({
      exerciseId: tricepsPushdown._id,
      alternatives: [skullCrushers._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 20,
      order: 3,
    });
    chestDayConfigs.push(tricepsPushdownConfig1._id);

    const chestDaySession = await Session.create({
      title: 'Chest Day',
      description: 'Intensive chest workout focusing on pectoral muscles',
      duration: 60,
      difficulty: 'intermediate',
      exerciseConfigs: chestDayConfigs,
      exercises: [benchPress._id, inclineDumbbellPress._id, cableFly._id, tricepsPushdown._id], // Legacy support
    });

    // BACK DAY
    const backDayConfigs = [];
    
    const latPulldownConfig = await SessionExerciseConfig.create({
      exerciseId: latPulldown._id,
      alternatives: [pullUps._id],
      sets: 4,
      targetReps: { min: 8, max: 12 },
      restTime: 90,
      recommendedStartingWeight: 50,
      order: 0,
    });
    backDayConfigs.push(latPulldownConfig._id);

    const seatedRowConfig = await SessionExerciseConfig.create({
      exerciseId: seatedCableRow._id,
      alternatives: [oneArmDumbbellRow._id],
      sets: 4,
      targetReps: { min: 10, max: 12 },
      restTime: 90,
      recommendedStartingWeight: 40,
      order: 1,
    });
    backDayConfigs.push(seatedRowConfig._id);

    const dumbbellRowConfig = await SessionExerciseConfig.create({
      exerciseId: oneArmDumbbellRow._id,
      alternatives: [seatedCableRow._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 60,
      recommendedStartingWeight: 20,
      order: 2,
    });
    backDayConfigs.push(dumbbellRowConfig._id);

    const barbellCurlConfig1 = await SessionExerciseConfig.create({
      exerciseId: barbellCurl._id,
      alternatives: [dumbbellCurl._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 15,
      order: 3,
    });
    backDayConfigs.push(barbellCurlConfig1._id);

    const backDaySession = await Session.create({
      title: 'Back Day',
      description: 'Comprehensive back workout',
      duration: 60,
      difficulty: 'intermediate',
      exerciseConfigs: backDayConfigs,
      exercises: [latPulldown._id, seatedCableRow._id, oneArmDumbbellRow._id, barbellCurl._id],
    });

    // LEG DAY
    const legDayConfigs = [];
    
    const squatConfig = await SessionExerciseConfig.create({
      exerciseId: squat._id,
      alternatives: [legPress._id],
      sets: 4,
      targetReps: { min: 10, max: 12 },
      restTime: 90,
      recommendedStartingWeight: 70,
      order: 0,
    });
    legDayConfigs.push(squatConfig._id);

    const legPressConfig = await SessionExerciseConfig.create({
      exerciseId: legPress._id,
      alternatives: [squat._id],
      sets: 4,
      targetReps: { min: 12, max: 15 },
      restTime: 60,
      recommendedStartingWeight: 100,
      order: 1,
    });
    legDayConfigs.push(legPressConfig._id);

    const legExtensionConfig = await SessionExerciseConfig.create({
      exerciseId: legExtension._id,
      alternatives: [],
      sets: 3,
      targetReps: { min: 12, max: 15 },
      restTime: 45,
      recommendedStartingWeight: 40,
      order: 2,
    });
    legDayConfigs.push(legExtensionConfig._id);

    const legCurlConfig = await SessionExerciseConfig.create({
      exerciseId: lyingLegCurl._id,
      alternatives: [],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 30,
      order: 3,
    });
    legDayConfigs.push(legCurlConfig._id);

    const legDaySession = await Session.create({
      title: 'Leg Day',
      description: 'Intensive leg workout',
      duration: 75,
      difficulty: 'intermediate',
      exerciseConfigs: legDayConfigs,
      exercises: [squat._id, legPress._id, legExtension._id, lyingLegCurl._id],
    });

    // SHOULDER DAY
    const shoulderDayConfigs = [];
    
    const shoulderPressConfig = await SessionExerciseConfig.create({
      exerciseId: shoulderPressMachine._id,
      alternatives: [dumbbellShoulderPress._id],
      sets: 4,
      targetReps: { min: 8, max: 12 },
      restTime: 60,
      recommendedStartingWeight: 30,
      order: 0,
    });
    shoulderDayConfigs.push(shoulderPressConfig._id);

    const lateralRaisesConfig = await SessionExerciseConfig.create({
      exerciseId: lateralRaises._id,
      alternatives: [],
      sets: 3,
      targetReps: { min: 12, max: 15 },
      restTime: 45,
      recommendedStartingWeight: 8,
      order: 1,
    });
    shoulderDayConfigs.push(lateralRaisesConfig._id);

    const rearDeltConfig = await SessionExerciseConfig.create({
      exerciseId: rearDeltFly._id,
      alternatives: [],
      sets: 3,
      targetReps: { min: 12, max: 15 },
      restTime: 45,
      recommendedStartingWeight: 10,
      order: 2,
    });
    shoulderDayConfigs.push(rearDeltConfig._id);

    const shoulderDaySession = await Session.create({
      title: 'Shoulder Day',
      description: 'Complete shoulder development',
      duration: 45,
      difficulty: 'intermediate',
      exerciseConfigs: shoulderDayConfigs,
      exercises: [shoulderPressMachine._id, lateralRaises._id, rearDeltFly._id],
    });

    // ARM DAY
    const armDayConfigs = [];
    
    const barbellCurlConfig2 = await SessionExerciseConfig.create({
      exerciseId: barbellCurl._id,
      alternatives: [dumbbellCurl._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 15,
      order: 0,
    });
    armDayConfigs.push(barbellCurlConfig2._id);

    const dumbbellCurlConfig = await SessionExerciseConfig.create({
      exerciseId: dumbbellCurl._id,
      alternatives: [barbellCurl._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 12,
      order: 1,
    });
    armDayConfigs.push(dumbbellCurlConfig._id);

    const skullCrushersConfig = await SessionExerciseConfig.create({
      exerciseId: skullCrushers._id,
      alternatives: [tricepsPushdown._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 15,
      order: 2,
    });
    armDayConfigs.push(skullCrushersConfig._id);

    const tricepsPushdownConfig2 = await SessionExerciseConfig.create({
      exerciseId: tricepsPushdown._id,
      alternatives: [skullCrushers._id],
      sets: 3,
      targetReps: { min: 10, max: 12 },
      restTime: 45,
      recommendedStartingWeight: 20,
      order: 3,
    });
    armDayConfigs.push(tricepsPushdownConfig2._id);

    const armDaySession = await Session.create({
      title: 'Arm Day',
      description: 'Bicep and tricep focus',
      duration: 45,
      difficulty: 'intermediate',
      exerciseConfigs: armDayConfigs,
      exercises: [barbellCurl._id, dumbbellCurl._id, skullCrushers._id, tricepsPushdown._id],
    });

    console.log(`✅ Created 5 workout sessions with exercise configurations`);

    // ==================== 3. WEEKLY TEMPLATE ====================
    console.log('\n📅 Creating weekly template...');

    const weeklyTemplate = await WeeklyTemplate.create({
      name: 'Programme Prise de Masse – 4 Semaines',
      monday: chestDaySession._id,
      tuesday: backDaySession._id,
      wednesday: null, // Rest
      thursday: legDaySession._id, // Legs on Thursday
      friday: shoulderDaySession._id, // Shoulders on Friday
      saturday: null, // Rest
      sunday: armDaySession._id,
    });
    console.log('✅ Created weekly template');

    // ==================== 4. ASSIGN PLAN TO USER ====================
    console.log('\n👤 Assigning program to test@test.com...');

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    // Set to Monday of current week
    const dayOfWeek = startDate.getDay();
    const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startDate.setDate(diff);

    const program = await Program.create({
      userId: testUser._id,
      startDate,
      durationWeeks: 4, // 4 weeks for February
      weeklyTemplateId: weeklyTemplate._id,
      completedWeeks: [],
      status: 'ACTIVE',
    });
    console.log('✅ Created program (4 weeks)');

    // ==================== 5. GENERATE DAILY PROGRAMS ====================
    console.log('\n📆 Generating daily programs for 4 weeks...');

    const dailyPrograms = [];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let week = 1; week <= 4; week++) {
      for (let day = 0; day < 7; day++) {
        const programDate = new Date(startDate);
        programDate.setDate(startDate.getDate() + ((week - 1) * 7) + day);
        
        const dayName = dayNames[day];
        const sessionId = (weeklyTemplate as any)[dayName];
        
        // Mark some past days as completed (week 1, days 1-3)
        const isPast = programDate < today;
        const isCompleted = isPast && week === 1 && day < 3;
        
        dailyPrograms.push({
          date: programDate,
          userId: testUser._id,
          weekNumber: week,
          waterTarget: 2000 + (week * 100),
          calorieTarget: 2200 + (week * 50),
          dailyGoal: 'Gain muscle',
          sessionId: sessionId || null,
          completed: isCompleted,
          mainObjective: {
            title: week <= 2 ? 'Build Foundation' : 'Increase Strength',
            description: `Week ${week} - Focus on progressive overload and proper form`,
            videoUrl: null,
          },
        });
      }
    }

    await DailyProgram.insertMany(dailyPrograms);
    console.log(`✅ Created ${dailyPrograms.length} daily programs (4 weeks)`);

    // ==================== 6. SEED BODY PROGRESS PHOTOS ====================
    console.log('\n📸 Seeding body progress photos...');

    // Add 2-3 body photos on different dates (placeholder images)
    const photoDates = [
      new Date(startDate.getTime() + 0 * 24 * 60 * 60 * 1000), // Day 1
      new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000), // Week 2, Day 1
      new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000), // Week 3, Day 1
    ];

    for (const photoDate of photoDates) {
      photoDate.setHours(0, 0, 0, 0);
      await BodyProgressPhoto.create({
        userId: testUser._id,
        date: photoDate,
        imageUrl: 'https://via.placeholder.com/400x600/00FF00/000000?text=Body+Photo', // Placeholder
        notes: `Photo du jour - ${photoDate.toLocaleDateString('fr-FR')}`,
        weight: 75 + Math.random() * 2, // Random weight between 75-77kg
      });
    }
    console.log(`✅ Created ${photoDates.length} body progress photos`);

    // ==================== 7. SEED COACH EVENTS (NUTRITIONIST) ====================
    console.log('\n🥗 Seeding coach events (nutritionist visits)...');

    // Week 2 - Friday (nutritionist visit)
    const nutritionistDate1 = new Date(startDate);
    nutritionistDate1.setDate(startDate.getDate() + (1 * 7) + 4); // Week 2, Friday (day 4 = Friday)
    nutritionistDate1.setHours(0, 0, 0, 0);

    // Week 4 - Friday (nutritionist visit)
    const nutritionistDate2 = new Date(startDate);
    nutritionistDate2.setDate(startDate.getDate() + (3 * 7) + 4); // Week 4, Friday
    nutritionistDate2.setHours(0, 0, 0, 0);

    await CoachEvent.create({
      userId: testUser._id,
      date: nutritionistDate1,
      type: 'nutrition_visit',
      title: 'RDV Nutritionniste',
      description: 'Consultation nutritionniste - Suivi de progression',
      completed: false,
    });

    await CoachEvent.create({
      userId: testUser._id,
      date: nutritionistDate2,
      type: 'nutrition_visit',
      title: 'RDV Nutritionniste',
      description: 'Consultation nutritionniste - Bilan final',
      completed: false,
    });

    console.log('✅ Created 2 nutritionist visit events');

    // ==================== SUMMARY ====================
    console.log('\n' + '='.repeat(60));
    console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n📋 Test User Credentials:');
    console.log('   Email: test@test.com');
    console.log('   Password: password123');
    console.log('   Level: Intiate');
    console.log('\n🏋️ Exercises Created:');
    console.log(`   Total: ${await Exercise.countDocuments()}`);
    console.log('   - All exercises have video URLs');
    console.log('   - Alternatives configured in SessionExerciseConfig');
    console.log('\n📅 Weekly Schedule:');
    console.log('   Monday: Chest Day');
    console.log('   Tuesday: Back Day');
    console.log('   Wednesday: Rest');
    console.log('   Thursday: Leg Day');
    console.log('   Friday: Shoulder Day');
    console.log('   Saturday: Rest');
    console.log('   Sunday: Arm Day');
    console.log(`\n📆 Program Start Date: ${startDate.toLocaleDateString('fr-FR')}`);
    console.log('   Duration: 4 weeks (28 days)');
    console.log('   Status: ACTIVE');
    console.log('\n📸 Body Photos:');
    console.log('   - 3 photos seeded on different dates');
    console.log('\n🥗 Nutritionist Visits:');
    console.log('   - Week 2, Friday');
    console.log('   - Week 4, Friday');
    console.log('\n🎯 Next Steps:');
    console.log('   1. Login with test@test.com / password123');
    console.log('   2. Check today\'s session in Home screen');
    console.log('   3. Start workout to see TikTok-style exercise cards');
    console.log('   4. Swipe up to see alternatives');
    console.log('   5. Track sets with smart recommendations');
    console.log('\n' + '='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

// Run the seed function
seedFitnessData();
