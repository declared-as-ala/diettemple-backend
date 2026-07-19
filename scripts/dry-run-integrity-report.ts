/**
 * DRY-RUN DATA INTEGRITY REPORT
 *
 * This script analyzes the current database state WITHOUT modifying anything.
 * It reports on:
 * - Existing LevelTemplates and their current names/levels
 * - Existing Users and their level assignments
 * - Mismatches between User.level and assigned plan
 * - Typos (Intiate vs Initiate)
 * - Plans with invalid min/max values
 * - Clients without assigned plans
 * - Missing or inactive plans
 *
 * Run: npx ts-node scripts/dry-run-integrity-report.ts
 */

import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import User from '../src/models/User.model';
import LevelTemplate from '../src/models/LevelTemplate.model';
import PlanAssignment from '../src/models/PlanAssignment.model';
import Subscription from '../src/models/Subscription.model';

// Load environment
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const VALID_LEVELS = ['INITIATE', 'FIGHTER', 'WARRIOR', 'CHAMPION', 'ELITE'];
const LEGACY_LEVEL_MAP: Record<string, string> = {
  'Intiate': 'INITIATE',
  'Initiate': 'INITIATE',
  'Fighter': 'FIGHTER',
  'Warrior': 'WARRIOR',
  'Champion': 'CHAMPION',
  'Elite': 'ELITE',
};

interface Report {
  timestamp: string;
  summary: {
    totalLevelTemplates: number;
    totalUsers: number;
    totalPlanAssignments: number;
    totalSubscriptions: number;
  };
  plans: Array<{
    id: string;
    name: string;
    gender: string;
    durationWeeks: number;
    isActive: boolean;
    minimumSessionsPerWeek?: number;
    maximumSessionsPerWeek?: number;
    inferredLevel: string | null;
    hasLevelField: boolean;
    hasValidMinMax: boolean;
    minMaxValidation?: string;
  }>;
  clients: Array<{
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    currentLevel: string;
    currentLevelHasTypo: boolean;
    assignedPlanId?: string;
    assignedPlanName?: string;
    assignedPlanLevel?: string;
    levelMatches: boolean;
    mismatchDetails?: string;
    planIsActive?: boolean;
    activePlanAssignment?: {
      id: string;
      status: string;
      startDate: string;
      endDate: string;
    };
    subscription?: {
      status: string;
      endAt: string;
    };
  }>;
  issues: {
    typosFound: number;
    levelMismatches: number;
    clientsWithoutPlan: number;
    plansWithInvalidMinMax: number;
    missingPlans: number;
    inactivePlansUsed: number;
  };
  detailedIssues: Array<{
    type: string;
    severity: 'info' | 'warning' | 'critical';
    clientId?: string;
    clientEmail?: string;
    planId?: string;
    message: string;
  }>;
}

async function generateReport(): Promise<Report> {
  const report: Report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalLevelTemplates: 0,
      totalUsers: 0,
      totalPlanAssignments: 0,
      totalSubscriptions: 0,
    },
    plans: [],
    clients: [],
    issues: {
      typosFound: 0,
      levelMismatches: 0,
      clientsWithoutPlan: 0,
      plansWithInvalidMinMax: 0,
      missingPlans: 0,
      inactivePlansUsed: 0,
    },
    detailedIssues: [],
  };

  try {
    // Connect to database
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in environment');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // ========== ANALYZE PLANS ==========
    const plans = await LevelTemplate.find({}).lean();
    report.summary.totalLevelTemplates = plans.length;

    console.log(`\n📊 Analyzing ${plans.length} LevelTemplates...`);

    for (const plan of plans) {
      const inferredLevel = LEGACY_LEVEL_MAP[plan.name] || null;
      const hasLevelField = 'level' in plan;

      let hasValidMinMax = true;
      let minMaxValidation = '';

      if (plan.minimumSessionsPerWeek !== undefined || plan.maximumSessionsPerWeek !== undefined) {
        const min = plan.minimumSessionsPerWeek ?? 1;
        const max = plan.maximumSessionsPerWeek ?? 7;

        if (min < 1 || min > 7) {
          hasValidMinMax = false;
          minMaxValidation = `Minimum ${min} is out of range [1-7]`;
        }
        if (max < 1 || max > 7) {
          hasValidMinMax = false;
          minMaxValidation = `Maximum ${max} is out of range [1-7]`;
        }
        if (max < min) {
          hasValidMinMax = false;
          minMaxValidation = `Maximum ${max} is less than minimum ${min}`;
        }
      }

      report.plans.push({
        id: plan._id.toString(),
        name: plan.name,
        gender: plan.gender || 'M',
        durationWeeks: plan.durationWeeks || 5,
        isActive: plan.isActive !== false,
        minimumSessionsPerWeek: plan.minimumSessionsPerWeek,
        maximumSessionsPerWeek: plan.maximumSessionsPerWeek,
        inferredLevel,
        hasLevelField,
        hasValidMinMax,
        minMaxValidation,
      });

      if (!hasValidMinMax) {
        report.issues.plansWithInvalidMinMax++;
        report.detailedIssues.push({
          type: 'plan_invalid_min_max',
          severity: 'critical',
          planId: plan._id.toString(),
          message: `Plan "${plan.name}" has invalid min/max: ${minMaxValidation}`,
        });
      }
    }

    // ========== ANALYZE CLIENTS ==========
    const users = await User.find({}).populate('assignedPlanId').lean();
    report.summary.totalUsers = users.length;

    console.log(`\n👥 Analyzing ${users.length} Users...`);

    for (const user of users) {
      const hasTypo = user.level === 'Intiate';
      const assignedPlan = user.assignedPlanId as any;
      const inferredAssignedLevel = assignedPlan ? LEGACY_LEVEL_MAP[assignedPlan.name] : null;

      let levelMatches = true;
      let mismatchDetails = '';

      if (assignedPlan) {
        if (user.level !== assignedPlan.name) {
          levelMatches = false;
          mismatchDetails = `User level is "${user.level}" but plan "${assignedPlan.name}"`;
        }
      }

      if (hasTypo) {
        report.issues.typosFound++;
        report.detailedIssues.push({
          type: 'typo_intiate',
          severity: 'warning',
          clientId: user._id.toString(),
          clientEmail: user.email,
          message: `User has level "Intiate" (typo, should be "Initiate")`,
        });
      }

      if (!levelMatches && assignedPlan) {
        report.issues.levelMismatches++;
        report.detailedIssues.push({
          type: 'level_mismatch',
          severity: 'critical',
          clientId: user._id.toString(),
          clientEmail: user.email,
          message: mismatchDetails,
        });
      }

      if (!assignedPlan) {
        report.issues.clientsWithoutPlan++;
        report.detailedIssues.push({
          type: 'no_assigned_plan',
          severity: 'info',
          clientId: user._id.toString(),
          clientEmail: user.email,
          message: 'User has no assigned plan',
        });
      }

      if (assignedPlan && !assignedPlan.isActive) {
        report.issues.inactivePlansUsed++;
        report.detailedIssues.push({
          type: 'inactive_plan_assigned',
          severity: 'warning',
          clientId: user._id.toString(),
          clientEmail: user.email,
          planId: assignedPlan._id.toString(),
          message: `User assigned to inactive plan "${assignedPlan.name}"`,
        });
      }

      const activePlanAssignment = await PlanAssignment.findOne({
        userId: user._id,
        status: 'active',
      }).lean();

      const subscription = await Subscription.findOne({
        userId: user._id,
        status: 'ACTIVE',
      }).lean();

      report.clients.push({
        id: user._id.toString(),
        email: user.email,
        phone: user.phone,
        name: user.name,
        currentLevel: user.level || 'NOT_SET',
        currentLevelHasTypo: hasTypo,
        assignedPlanId: assignedPlan?._id.toString(),
        assignedPlanName: assignedPlan?.name,
        assignedPlanLevel: inferredAssignedLevel,
        levelMatches,
        mismatchDetails: mismatchDetails || undefined,
        planIsActive: assignedPlan?.isActive,
        activePlanAssignment: activePlanAssignment
          ? {
              id: activePlanAssignment._id.toString(),
              status: activePlanAssignment.status,
              startDate: new Date(activePlanAssignment.startDate).toISOString(),
              endDate: new Date(activePlanAssignment.endDate!).toISOString(),
            }
          : undefined,
        subscription: subscription
          ? {
              status: subscription.status,
              endAt: new Date(subscription.endAt).toISOString(),
            }
          : undefined,
      });
    }

    // ========== ANALYZE PLAN ASSIGNMENTS ==========
    const planAssignments = await PlanAssignment.find({}).lean();
    report.summary.totalPlanAssignments = planAssignments.length;

    // ========== ANALYZE SUBSCRIPTIONS ==========
    const subscriptions = await Subscription.find({}).lean();
    report.summary.totalSubscriptions = subscriptions.length;

    // ========== PRINT SUMMARY ==========
    console.log('\n' + '='.repeat(80));
    console.log('DRY-RUN DATA INTEGRITY REPORT');
    console.log('='.repeat(80));
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`\nSummary:`);
    console.log(`  - LevelTemplates: ${report.summary.totalLevelTemplates}`);
    console.log(`  - Users: ${report.summary.totalUsers}`);
    console.log(`  - PlanAssignments: ${report.summary.totalPlanAssignments}`);
    console.log(`  - Subscriptions: ${report.summary.totalSubscriptions}`);

    console.log(`\nIssues Found:`);
    console.log(`  - Typos (Intiate): ${report.issues.typosFound}`);
    console.log(`  - Level Mismatches: ${report.issues.levelMismatches}`);
    console.log(`  - Clients without plan: ${report.issues.clientsWithoutPlan}`);
    console.log(`  - Plans with invalid min/max: ${report.issues.plansWithInvalidMinMax}`);
    console.log(`  - Inactive plans used: ${report.issues.inactivePlansUsed}`);

    if (report.detailedIssues.length > 0) {
      console.log(`\nDetailed Issues (${report.detailedIssues.length}):`);
      for (const issue of report.detailedIssues) {
        const icon = issue.severity === 'critical' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`  ${icon} [${issue.type}] ${issue.message}`);
      }
    }

    // Save report to file
    const fs = await import('fs/promises');
    const reportPath = path.resolve(__dirname, '../DRY_RUN_REPORT.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✓ Full report saved to: ${reportPath}`);

    // Await disconnection
    await mongoose.disconnect();

    return report;
  } catch (error) {
    console.error('❌ Error generating report:', error);
    throw error;
  }
}

// Run
generateReport().catch(console.error);
