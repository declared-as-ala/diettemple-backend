import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import User from '../models/User.model';
import Exercise from '../models/Exercise.model';
import Session from '../models/Session.model';
import DailyProgram from '../models/DailyProgram.model';
import WeeklyTemplate from '../models/WeeklyTemplate.model';
import Program from '../models/Program.model';
import ExerciseProgram from '../models/ExerciseProgram.model';
import ExerciseHistory from '../models/ExerciseHistory.model';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

async function seed6WeekProgram() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    await Exercise.deleteMany({});
    await Session.deleteMany({});
    await DailyProgram.deleteMany({});
    await WeeklyTemplate.deleteMany({});
    await Program.deleteMany({});
    console.log('✅ Cleared existing program data');

    // Find or create test user
    let testUser = await User.findOne({ email: 'test@test.com' });
    
    if (!testUser) {
      const passwordHash = await bcrypt.hash('password123', 10);
      testUser = await User.create({
        email: 'test@test.com',
        passwordHash,
        name: 'Test User',
        level: 'Fighter',
        objectif: 'Gain muscle',
      });
      console.log('✅ Created test user');
    } else {
      if (!testUser.level) {
        testUser.level = 'Fighter';
        await testUser.save();
      }
      console.log('✅ Test user already exists');
    }

    // Create Exercises with default weights
    const exercises = await Exercise.insertMany([
      // Chest exercises
      { name: 'Bench Press', muscleGroup: 'Chest', reps: 10, sets: 4, restTime: 90, defaultWeight: 60 },
      { name: 'Incline Dumbbell Press', muscleGroup: 'Chest', reps: 12, sets: 3, restTime: 60, defaultWeight: 20 },
      { name: 'Cable Flyes', muscleGroup: 'Chest', reps: 15, sets: 3, restTime: 45, defaultWeight: 15 },
      
      // Back exercises
      { name: 'Deadlift', muscleGroup: 'Back', reps: 8, sets: 3, restTime: 120, defaultWeight: 80 },
      { name: 'Pull-ups', muscleGroup: 'Back', reps: 10, sets: 4, restTime: 60, defaultWeight: 0 }, // Bodyweight
      { name: 'Barbell Rows', muscleGroup: 'Back', reps: 10, sets: 4, restTime: 90, defaultWeight: 50 },
      
      // Shoulder exercises
      { name: 'Shoulder Press', muscleGroup: 'Shoulders', reps: 10, sets: 4, restTime: 60, defaultWeight: 30 },
      { name: 'Lateral Raises', muscleGroup: 'Shoulders', reps: 12, sets: 3, restTime: 45, defaultWeight: 8 },
      { name: 'Rear Delt Flyes', muscleGroup: 'Shoulders', reps: 15, sets: 3, restTime: 45, defaultWeight: 10 },
      
      // Leg exercises
      { name: 'Squats', muscleGroup: 'Legs', reps: 12, sets: 4, restTime: 90, defaultWeight: 70 },
      { name: 'Leg Press', muscleGroup: 'Legs', reps: 15, sets: 4, restTime: 60, defaultWeight: 100 },
      { name: 'Leg Curls', muscleGroup: 'Legs', reps: 12, sets: 3, restTime: 45, defaultWeight: 40 },
      
      // Arm exercises
      { name: 'Bicep Curls', muscleGroup: 'Arms', reps: 12, sets: 3, restTime: 45, defaultWeight: 12 },
      { name: 'Tricep Dips', muscleGroup: 'Arms', reps: 12, sets: 3, restTime: 45, defaultWeight: 0 }, // Bodyweight
      { name: 'Hammer Curls', muscleGroup: 'Arms', reps: 12, sets: 3, restTime: 45, defaultWeight: 10 },
    ]);
    console.log(`✅ Created ${exercises.length} exercises`);

    // Create Sessions for each day
    const chestSession = await Session.create({
      title: 'Chest Day',
      description: 'Intensive chest workout focusing on pectoral muscles',
      duration: 60,
      difficulty: 'intermediate',
      exercises: [exercises[0]._id, exercises[1]._id, exercises[2]._id], // Bench Press, Incline DB Press, Cable Flyes
    });

    const backSession = await Session.create({
      title: 'Back Day',
      description: 'Comprehensive back workout',
      duration: 60,
      difficulty: 'intermediate',
      exercises: [exercises[3]._id, exercises[4]._id, exercises[5]._id], // Deadlift, Pull-ups, Barbell Rows
    });

    const shoulderSession = await Session.create({
      title: 'Shoulder Day',
      description: 'Complete shoulder development',
      duration: 45,
      difficulty: 'intermediate',
      exercises: [exercises[6]._id, exercises[7]._id, exercises[8]._id], // Shoulder Press, Lateral Raises, Rear Delt Flyes
    });

    const legsSession = await Session.create({
      title: 'Legs Day',
      description: 'Intensive leg workout',
      duration: 75,
      difficulty: 'intermediate',
      exercises: [exercises[9]._id, exercises[10]._id, exercises[11]._id], // Squats, Leg Press, Leg Curls
    });

    const armsSession = await Session.create({
      title: 'Arm Day',
      description: 'Bicep and tricep focus',
      duration: 45,
      difficulty: 'intermediate',
      exercises: [exercises[12]._id, exercises[13]._id, exercises[14]._id], // Bicep Curls, Tricep Dips, Hammer Curls
    });

    console.log('✅ Created 5 workout sessions');

    // Create Weekly Template
    const weeklyTemplate = await WeeklyTemplate.create({
      name: 'Standard 6-Week Template',
      monday: chestSession._id,
      tuesday: backSession._id,
      wednesday: null, // Rest day
      thursday: shoulderSession._id,
      friday: legsSession._id,
      saturday: null, // Rest day
      sunday: armsSession._id,
    });
    console.log('✅ Created weekly template');

    // Create Program for test user
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    // Set to Monday of current week
    const dayOfWeek = startDate.getDay();
    const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    startDate.setDate(diff);

    // For testing: Mark program as completed if you want to test the completion message
    // Change status to 'COMPLETED' to test the completion banner
    const program = await Program.create({
      userId: testUser._id,
      startDate,
      durationWeeks: 6,
      weeklyTemplateId: weeklyTemplate._id,
      completedWeeks: [1, 2, 3, 4, 5, 6], // All weeks completed for testing
      status: 'ACTIVE', // Change to 'COMPLETED' to test completion message
    });
    console.log('✅ Created program');

    // Generate 6 weeks (42 days) of DailyPrograms
    const dailyPrograms = [];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    for (let week = 1; week <= 6; week++) {
      for (let day = 0; day < 7; day++) {
        const programDate = new Date(startDate);
        programDate.setDate(startDate.getDate() + ((week - 1) * 7) + day);
        
        const dayName = dayNames[day];
        const sessionId = (weeklyTemplate as any)[dayName];
        
        // Mark some days as completed for testing (week 1, days 1-3)
        const isCompleted = week === 1 && day < 3;
        
        dailyPrograms.push({
          date: programDate,
          userId: testUser._id,
          weekNumber: week,
          waterTarget: 2000 + (week * 100), // Increase water target each week
          calorieTarget: 2200 + (week * 50), // Increase calories each week
          dailyGoal: week <= 2 ? 'Gain muscle' : week <= 4 ? 'Build strength' : 'Maintain and refine',
          sessionId: sessionId || null,
          completed: isCompleted,
          mainObjective: {
            title: week <= 2 ? 'Build Foundation' : week <= 4 ? 'Increase Strength' : 'Refine Technique',
            description: `Week ${week} - Focus on progressive overload`,
            videoUrl: null,
          },
        });
      }
    }

    await DailyProgram.insertMany(dailyPrograms);
    console.log(`✅ Created ${dailyPrograms.length} daily programs (6 weeks)`);

    // Create Exercise Programs (Coach prescriptions)
    console.log('📋 Creating exercise programs (coach prescriptions)...');
    const exercisePrograms = await ExerciseProgram.insertMany([
      {
        exerciseId: exercises[0]._id, // Bench Press
        targetSets: 4,
        targetReps: { min: 10, max: 12 },
        baseWeight: 60,
        restSeconds: 90,
      },
      {
        exerciseId: exercises[1]._id, // Incline Dumbbell Press
        targetSets: 3,
        targetReps: { min: 10, max: 12 },
        baseWeight: 20,
        restSeconds: 60,
      },
      {
        exerciseId: exercises[6]._id, // Shoulder Press
        targetSets: 4,
        targetReps: { min: 10, max: 12 },
        baseWeight: 30,
        restSeconds: 60,
      },
      {
        exerciseId: exercises[9]._id, // Squats
        targetSets: 4,
        targetReps: { min: 10, max: 12 },
        baseWeight: 70,
        restSeconds: 90,
      },
      {
        exerciseId: exercises[12]._id, // Bicep Curls
        targetSets: 3,
        targetReps: { min: 10, max: 12 },
        baseWeight: 12,
        restSeconds: 45,
      },
    ]);
    console.log(`✅ Created ${exercisePrograms.length} exercise programs`);

    // Create Exercise History (Previous session data)
    // One exercise passed (eligible for +2kg) - Bench Press
    // One exercise failed (stay same weight) - Shoulder Press
    console.log('📊 Creating exercise history...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    await ExerciseHistory.create({
      userId: testUser._id,
      exerciseId: exercises[0]._id, // Bench Press - PASSED (all sets >= 12)
      lastWeight: 60,
      lastReps: [12, 12, 12, 12],
      lastSets: [
        { setNumber: 1, weight: 60, reps: 12, completed: true, completedAt: yesterday },
        { setNumber: 2, weight: 60, reps: 12, completed: true, completedAt: yesterday },
        { setNumber: 3, weight: 60, reps: 12, completed: true, completedAt: yesterday },
        { setNumber: 4, weight: 60, reps: 12, completed: true, completedAt: yesterday },
      ],
      lastCompletedAt: yesterday,
      recommendedNextWeight: 62, // +2kg recommendation
      progressionStatus: 'eligible',
      totalVolume: 60 * 48, // 2880 kg
    });

    await ExerciseHistory.create({
      userId: testUser._id,
      exerciseId: exercises[6]._id, // Shoulder Press - FAILED (some sets < 12)
      lastWeight: 30,
      lastReps: [12, 11, 10, 9],
      lastSets: [
        { setNumber: 1, weight: 30, reps: 12, completed: true, completedAt: yesterday },
        { setNumber: 2, weight: 30, reps: 11, completed: true, completedAt: yesterday },
        { setNumber: 3, weight: 30, reps: 10, completed: true, completedAt: yesterday },
        { setNumber: 4, weight: 30, reps: 9, completed: true, completedAt: yesterday },
      ],
      lastCompletedAt: yesterday,
      recommendedNextWeight: 30, // Stay same weight
      progressionStatus: 'failed',
      totalVolume: 30 * 42, // 1260 kg
    });

    console.log('✅ Created exercise history (1 passed, 1 failed)');
    console.log('✅ Seed data completed successfully!');
    console.log('\n📋 Test User Credentials:');
    console.log('   Email: test@test.com');
    console.log('   Password: password123');
    console.log('   Level: Fighter');
    console.log('\n📅 Program Structure:');
    console.log('   Monday: Chest Day');
    console.log('   Tuesday: Back Day');
    console.log('   Wednesday: Rest');
    console.log('   Thursday: Shoulder Day');
    console.log('   Friday: Legs Day');
    console.log('   Saturday: Rest');
    console.log('   Sunday: Arm Day');
    console.log(`\n📆 Program Start Date: ${startDate.toLocaleDateString()}`);
    console.log('   Duration: 6 weeks (42 days)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

// Run the seed function
seed6WeekProgram();

