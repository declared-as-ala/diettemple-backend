import mongoose from 'mongoose';
import DailyProgram from '../models/DailyProgram.model';
import User from '../models/User.model';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface ObjectiveUpdate {
  title: string;
  description?: string;
  videoUrl?: string;
}

interface UpdateConfig {
  // Either update all users, specific users, or by level
  scope: 'all' | 'users' | 'level' | 'date-range';
  userIds?: string[]; // For scope='users'
  level?: string; // For scope='level'
  dateRange?: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  };
  // Update objective for these dates
  dates?: string[]; // YYYY-MM-DD format, or 'all-future' or 'all-past'
  objective: ObjectiveUpdate;
  dryRun?: boolean; // Log changes without saving
}

async function updateDailyObjectives(config: UpdateConfig) {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Build query for daily programs
    const query: any = {};

    // Build date filter
    if (config.dates) {
      if (config.dates[0] === 'all-future') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query.date = { $gte: today };
        console.log(`📅 Scope: All dates from today onwards`);
      } else if (config.dates[0] === 'all-past') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query.date = { $lt: today };
        console.log(`📅 Scope: All past dates`);
      } else {
        // Specific dates
        const dateQueries = config.dates.map(dateStr => {
          const date = new Date(dateStr);
          const endDate = new Date(date);
          endDate.setDate(endDate.getDate() + 1);
          return {
            date: {
              $gte: date,
              $lt: endDate,
            },
          };
        });
        query.$or = dateQueries;
        console.log(`📅 Scope: ${config.dates.length} specific date(s)`);
      }
    }

    // Build user filter
    if (config.scope === 'users' && config.userIds?.length) {
      const objectIds = config.userIds.map(id => new mongoose.Types.ObjectId(id));
      query.userId = { $in: objectIds };
      console.log(`👤 Scope: ${config.userIds.length} specific user(s)`);
    } else if (config.scope === 'level' && config.level) {
      // Get users with this level
      const users = await User.find({ level: config.level }).select('_id');
      const userIds = users.map(u => u._id);
      query.userId = { $in: userIds };
      console.log(`📊 Scope: All users with level "${config.level}" (${users.length} users)`);
    } else if (config.scope === 'all') {
      console.log(`🌍 Scope: All daily programs`);
    }

    // If date range is specified (for filtering existing programs)
    if (config.dateRange) {
      const startDate = new Date(config.dateRange.startDate);
      const endDate = new Date(config.dateRange.endDate);
      endDate.setDate(endDate.getDate() + 1);
      query.date = {
        $gte: startDate,
        $lt: endDate,
      };
      console.log(`📆 Date range: ${config.dateRange.startDate} to ${config.dateRange.endDate}`);
    }

    // Find matching daily programs
    const dailyPrograms = await DailyProgram.find(query);
    console.log(`\n📋 Found ${dailyPrograms.length} daily program(s) to update\n`);

    if (dailyPrograms.length === 0) {
      console.log('⚠️  No matching daily programs found');
      return;
    }

    // Prepare update
    const mainObjective = {
      title: config.objective.title,
      description: config.objective.description || '',
      videoUrl: config.objective.videoUrl || null,
    };

    if (config.dryRun) {
      console.log('🔍 DRY RUN MODE - Changes will not be saved\n');
      console.log('Sample of programs to be updated:');
      dailyPrograms.slice(0, 5).forEach(program => {
        console.log(`  • User ${program.userId} on ${program.date.toISOString().split('T')[0]}`);
      });
      if (dailyPrograms.length > 5) {
        console.log(`  ... and ${dailyPrograms.length - 5} more`);
      }
      console.log(`\nObjective to apply:`, mainObjective);
    } else {
      // Apply update
      const result = await DailyProgram.updateMany(query, { mainObjective });

      console.log('✅ Update Summary:');
      console.log(`  • Modified: ${result.modifiedCount}`);
      console.log(`  • Matched: ${result.matchedCount}`);
      console.log(`  • Acknowledged: ${result.acknowledged}`);

      if (result.modifiedCount > 0) {
        console.log('\n✓ Daily objectives updated successfully!');
        console.log(`\nObjective applied:`);
        console.log(`  Title: ${mainObjective.title}`);
        console.log(`  Description: ${mainObjective.description || '(none)'}`);
        console.log(`  Video: ${mainObjective.videoUrl || '(none)'}`);
      }
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  }
}

// Example configurations

// 1. Update all users for all future dates
const exampleConfig1: UpdateConfig = {
  scope: 'all',
  dates: ['all-future'],
  objective: {
    title: 'Objectif Principal',
    description: 'Complete your scheduled session with proper form.',
    videoUrl: '/media/videos/objectif_principal.mp4',
  },
  dryRun: false,
};

// 2. Update specific users for specific dates
const exampleConfig2: UpdateConfig = {
  scope: 'users',
  userIds: ['64f8a3b2c1d2e3f4g5h6i7j8', '64f8a3b2c1d2e3f4g5h6i7j9'],
  dates: ['2026-06-27', '2026-06-28', '2026-06-29'],
  objective: {
    title: 'Monday Strength Focus',
    description: 'Focus on heavy compound movements.',
    videoUrl: '/media/videos/strength_focus.mp4',
  },
  dryRun: true, // Run in dry-run mode first
};

// 3. Update by user level
const exampleConfig3: UpdateConfig = {
  scope: 'level',
  level: 'Elite',
  dateRange: {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  },
  objective: {
    title: 'Elite Challenge',
    description: 'Elite-level training focus.',
    videoUrl: '/media/videos/elite_challenge.mp4',
  },
  dryRun: false,
};

// 4. Update for a specific date across all users
const exampleConfig4: UpdateConfig = {
  scope: 'all',
  dates: ['2026-06-27'],
  objective: {
    title: 'Daily Motivation',
    description: 'Stay focused and push yourself!',
    videoUrl: '/media/videos/daily_motivation.mp4',
  },
  dryRun: true,
};

// Run the update - replace with your desired config
// Change exampleConfig1 to exampleConfig2, exampleConfig3, or exampleConfig4 as needed
updateDailyObjectives(exampleConfig1).catch(console.error);

// ==================== USAGE ====================
//
// npm run ts-node src/scripts/updateDailyObjectives.ts
//
// Edit the script to use the desired example configuration (exampleConfig1-4)
//
// Configurations:
// 1. exampleConfig1: Update all users, all future dates
// 2. exampleConfig2: Update specific users, specific dates
// 3. exampleConfig3: Update by user level, within date range
// 4. exampleConfig4: Update specific date, all users
//
// Set dryRun: true to preview changes before saving
// Set dryRun: false to apply changes
