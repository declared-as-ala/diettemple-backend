import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import User from '../models/User.model';
import Exercise from '../models/Exercise.model';
import Session from '../models/Session.model';
import DailyProgram from '../models/DailyProgram.model';

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/diettemple';

async function seedHomeData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data (optional - comment out if you want to keep existing data)
    await Exercise.deleteMany({});
    await Session.deleteMany({});
    await DailyProgram.deleteMany({});
    console.log('✅ Cleared existing home data');

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
      // Update user level if needed
      if (!testUser.level) {
        testUser.level = 'Fighter';
        await testUser.save();
      }
      console.log('✅ Test user already exists');
    }

    // Create Exercises
    const exercises = await Exercise.insertMany([
      {
        name: 'Squats',
        muscleGroup: 'Legs',
        reps: 12,
        sets: 4,
        restTime: 60,
        description: 'Compound exercise targeting quadriceps, hamstrings, and glutes',
      },
      {
        name: 'Bench Press',
        muscleGroup: 'Chest',
        reps: 10,
        sets: 4,
        restTime: 90,
        description: 'Upper body exercise targeting chest, shoulders, and triceps',
      },
      {
        name: 'Deadlift',
        muscleGroup: 'Back',
        reps: 8,
        sets: 3,
        restTime: 120,
        description: 'Full body compound movement targeting back, legs, and core',
      },
      {
        name: 'Pull-ups',
        muscleGroup: 'Back',
        reps: 10,
        sets: 3,
        restTime: 60,
        description: 'Bodyweight exercise targeting lats and biceps',
      },
      {
        name: 'Leg Press',
        muscleGroup: 'Legs',
        reps: 15,
        sets: 4,
        restTime: 60,
        description: 'Machine exercise targeting quadriceps and glutes',
      },
      {
        name: 'Bicep Curls',
        muscleGroup: 'Arms',
        reps: 12,
        sets: 3,
        restTime: 45,
        description: 'Isolation exercise targeting biceps',
      },
      {
        name: 'Tricep Dips',
        muscleGroup: 'Arms',
        reps: 12,
        sets: 3,
        restTime: 45,
        description: 'Bodyweight exercise targeting triceps',
      },
      {
        name: 'Shoulder Press',
        muscleGroup: 'Shoulders',
        reps: 10,
        sets: 3,
        restTime: 60,
        description: 'Upper body exercise targeting shoulders and triceps',
      },
    ]);
    console.log(`✅ Created ${exercises.length} exercises`);

    // Create Sessions
    const legDaySession = await Session.create({
      title: 'Jour jambes',
      description: 'Intensive leg workout focusing on quadriceps, hamstrings, and glutes',
      duration: 60,
      difficulty: 'intermediate',
      exercises: [exercises[0]._id, exercises[4]._id], // Squats, Leg Press
    });

    const upperBodySession = await Session.create({
      title: 'Upper Body Strength',
      description: 'Comprehensive upper body workout',
      duration: 45,
      difficulty: 'intermediate',
      exercises: [exercises[1]._id, exercises[3]._id, exercises[7]._id], // Bench Press, Pull-ups, Shoulder Press
    });

    const fullBodySession = await Session.create({
      title: 'Full Body Workout',
      description: 'Complete body workout targeting all major muscle groups',
      duration: 75,
      difficulty: 'advanced',
      exercises: [exercises[0]._id, exercises[1]._id, exercises[2]._id, exercises[3]._id], // Squats, Bench Press, Deadlift, Pull-ups
    });

    console.log('✅ Created 3 sessions');

    // Create Daily Programs
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Today - with session
    await DailyProgram.create({
      date: today,
      userId: testUser._id,
      waterTarget: 2000,
      calorieTarget: 2200,
      dailyGoal: 'Gain muscle',
      sessionId: legDaySession._id,
      mainObjective: {
        title: 'Build Strength and Muscle Mass',
        description: 'Focus on progressive overload and proper nutrition',
        videoUrl: null, // Placeholder for now
      },
    });

    // Yesterday - with session
    await DailyProgram.create({
      date: yesterday,
      userId: testUser._id,
      waterTarget: 2500,
      calorieTarget: 2400,
      dailyGoal: 'Gain muscle',
      sessionId: upperBodySession._id,
      mainObjective: {
        title: 'Upper Body Development',
        description: 'Focus on chest, back, and shoulders',
        videoUrl: null,
      },
    });

    // Two days ago - WITHOUT session (to test conditional rendering)
    await DailyProgram.create({
      date: twoDaysAgo,
      userId: testUser._id,
      waterTarget: 1800,
      calorieTarget: 2000,
      dailyGoal: 'Lose fat',
      sessionId: null, // No session for this day
      mainObjective: {
        title: 'Fat Loss Focus',
        description: 'Calorie deficit and cardio',
        videoUrl: null,
      },
    });

    console.log('✅ Created 3 daily programs');
    console.log('✅ Seed data completed successfully!');
    console.log('\n📋 Test User Credentials:');
    console.log('   Email: test@test.com');
    console.log('   Password: password123');
    console.log('   Level: Fighter');
    console.log('\n📅 Daily Programs:');
    console.log(`   Today (${today.toLocaleDateString()}): With session`);
    console.log(`   Yesterday (${yesterday.toLocaleDateString()}): With session`);
    console.log(`   Two days ago (${twoDaysAgo.toLocaleDateString()}): Without session`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

// Run the seed function
seedHomeData();

