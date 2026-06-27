# Daily Objectives Management Guide

This guide explains how to manage the "Objectif Principal" (Main Objective) video and instructions shown on the home page of the mobile app.

## Overview

The **"Objectif Principal"** section at the bottom of the home page displays:
- A video (e.g., form tips, motivational content)
- A title (e.g., "Objectif Principal")
- Instructions/description (e.g., "Complete your scheduled session with proper form")

This content is managed per user, per date through **Daily Programs**.

---

## Option 1: Using the Admin Dashboard UI (Easiest)

### Access the Daily Objectives Manager

1. Go to **Admin Dashboard** → **Daily Objectives**
2. URL: `https://your-domain/admin/daily-objectives`

### How to Update a User's Daily Objective

#### Step 1: Select User
- Type the user's **name** or **email** in the "Select User" field
- A dropdown will show matching users
- Click to select the user

#### Step 2: Select Date
- Choose the date for the daily program using the date picker
- Format: `YYYY-MM-DD`

#### Step 3: Upload Video (Optional)
- Click "Choose video file" or drag-drop a video
- Supported formats: MP4, WebM
- Maximum size: 500MB
- Click "Upload Video" button
- Wait for the upload to complete (green success message)

#### Step 4: Fill in Objective Details
- **Title** (required): e.g., "Objectif Principal", "Focus on Form"
- **Description** (optional): e.g., "Complete your scheduled session with proper form and full range of motion."
- **Video URL**: Auto-filled after upload, or enter manually

#### Step 5: Submit
- Click "Update Daily Objective"
- Wait for confirmation message
- The video will appear in the app

---

## Option 2: Using the API Directly

### Prerequisites
- Admin authentication token
- User ID (MongoDB ObjectId)
- Video file (if uploading)

### Upload a Video

**Endpoint:**
```
POST /api/admin/daily-programs/{userId}/{date}/main-objective/video
```

**Example with cURL:**
```bash
curl -X POST \
  https://api.diettemple.tn/api/admin/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/main-objective/video \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "video=@/path/to/video.mp4"
```

**Response:**
```json
{
  "message": "Video uploaded successfully",
  "videoUrl": "/media/videos/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/objective_123456.mp4"
}
```

### Update Objective Details

**Endpoint:**
```
PUT /api/admin/daily-programs/{userId}/{date}/main-objective
```

**Example with cURL:**
```bash
curl -X PUT \
  https://api.diettemple.tn/api/admin/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/main-objective \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Objectif Principal",
    "description": "Complete your scheduled session with proper form.",
    "videoUrl": "/media/videos/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/objective_123456.mp4"
  }'
```

**Response:**
```json
{
  "message": "Main objective updated successfully",
  "dailyProgram": {
    "_id": "...",
    "userId": "64f8a3b2c1d2e3f4g5h6i7j8",
    "date": "2026-06-27T00:00:00.000Z",
    "mainObjective": {
      "title": "Objectif Principal",
      "description": "Complete your scheduled session with proper form.",
      "videoUrl": "/media/videos/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/objective_123456.mp4"
    }
  }
}
```

---

## Option 3: Batch Update Script (For Multiple Users/Dates)

### Use Case
Update daily objectives for:
- All users on a specific date
- Multiple users across multiple dates
- All users with a specific level
- All future dates for all users

### Prerequisites
- Node.js installed
- Backend environment set up

### Script File
```
src/scripts/updateDailyObjectives.ts
```

### Available Configurations

#### Config 1: Update All Users for All Future Dates
```typescript
const config: UpdateConfig = {
  scope: 'all',
  dates: ['all-future'],
  objective: {
    title: 'Objectif Principal',
    description: 'Complete your scheduled session.',
    videoUrl: '/media/videos/objectif_principal.mp4',
  },
  dryRun: false,
};
```

#### Config 2: Update Specific Users for Specific Dates
```typescript
const config: UpdateConfig = {
  scope: 'users',
  userIds: ['64f8a3b2c1d2e3f4g5h6i7j8', '64f8a3b2c1d2e3f4g5h6i7j9'],
  dates: ['2026-06-27', '2026-06-28', '2026-06-29'],
  objective: {
    title: 'Monday Strength Focus',
    description: 'Focus on heavy compound movements.',
    videoUrl: '/media/videos/strength_focus.mp4',
  },
  dryRun: true,
};
```

#### Config 3: Update by User Level
```typescript
const config: UpdateConfig = {
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
```

#### Config 4: Update for a Specific Date Across All Users
```typescript
const config: UpdateConfig = {
  scope: 'all',
  dates: ['2026-06-27'],
  objective: {
    title: 'Daily Motivation',
    description: 'Stay focused!',
    videoUrl: '/media/videos/daily_motivation.mp4',
  },
  dryRun: true,
};
```

### How to Run

1. **Edit the script** to select your configuration:
   ```bash
   cd DietTemple
   nano src/scripts/updateDailyObjectives.ts
   # Change the last line to use your desired config
   ```

2. **First, run in dry-run mode** to preview changes:
   ```bash
   npm run ts-node src/scripts/updateDailyObjectives.ts
   ```

3. **Review the output** - shows which programs will be updated

4. **Run for real** - change `dryRun: false` and run again:
   ```bash
   npm run ts-node src/scripts/updateDailyObjectives.ts
   ```

### Dry-Run Example Output
```
✓ Connected to MongoDB
📅 Scope: All dates from today onwards
🌍 Scope: All daily programs

📋 Found 156 daily program(s) to update

🔍 DRY RUN MODE - Changes will not be saved

Sample of programs to be updated:
  • User 64f8a3b2c1d2e3f4g5h6i7j8 on 2026-06-27
  • User 64f8a3b2c1d2e3f4g5h6i7j9 on 2026-06-28
  ... and 154 more

Objective to apply:
 {
  title: 'Objectif Principal',
  description: 'Complete your scheduled session with proper form.',
  videoUrl: '/media/videos/objectif_principal.mp4'
}
```

### Apply Update
```
✓ Connected to MongoDB
📅 Scope: All dates from today onwards
🌍 Scope: All daily programs

📋 Found 156 daily program(s) to update

✅ Update Summary:
  • Modified: 156
  • Matched: 156
  • Acknowledged: true

✓ Daily objectives updated successfully!

Objective applied:
  Title: Objectif Principal
  Description: Complete your scheduled session with proper form.
  Video: /media/videos/objectif_principal.mp4

✓ Database connection closed
```

---

## Database Schema

### DailyProgram Model

```typescript
interface IDailyProgram extends Document {
  date: Date;
  userId: mongoose.Types.ObjectId;
  weekNumber?: number;
  waterTarget?: number;
  calorieTarget?: number;
  dailyGoal?: string;
  sessionId?: mongoose.Types.ObjectId | ISession | null;
  sessionTemplateId?: mongoose.Types.ObjectId | null;
  completed?: boolean;
  mainObjective?: {
    title: string;
    description?: string;
    videoUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### Example Document

```json
{
  "_id": "ObjectId(...)",
  "date": "2026-06-27T00:00:00Z",
  "userId": "ObjectId(64f8a3b2c1d2e3f4g5h6i7j8)",
  "weekNumber": 1,
  "mainObjective": {
    "title": "Objectif Principal",
    "description": "Complete your scheduled session with proper form and full range of motion.",
    "videoUrl": "/media/videos/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/objective_video.mp4"
  },
  "sessionTemplateId": "ObjectId(...)",
  "createdAt": "2026-06-26T10:00:00Z",
  "updatedAt": "2026-06-27T08:30:00Z"
}
```

---

## What Users See in the App

When a daily program has a main objective configured:

### Home Screen (HomeDashboardScreen)
- If `todayDashboard` is not available and `dailyProgram` is loaded:
  - Shows **"Objectif principal"** card
  - Displays the video with play button
  - Shows title and description below video
  - Users can tap to play/pause

### Location in App
```
Home Page:
├── Header (Welcome, Calendar, Notifications)
├── Date Selector
├── Premium Header
├── Subscription Card
├── Today Plan Card
├── Nutrition Card
└── Objectif Principal ← YOUR CONTENT HERE
    ├── Video Player
    ├── Title
    └── Description
```

---

## Troubleshooting

### Video doesn't appear in app
1. ✅ Check date matches today's date
2. ✅ Check videoUrl is not empty/null
3. ✅ Verify video file format (MP4 or WebM)
4. ✅ Check video URL is accessible/correct path

### Upload fails
1. ✅ Check file size (max 500MB)
2. ✅ Verify it's a valid video file
3. ✅ Check user ID is correct (copy from Users page)
4. ✅ Check date format (YYYY-MM-DD)

### Batch script doesn't update
1. ✅ Verify MONGODB_URI is set in .env
2. ✅ Check MongoDB connection
3. ✅ Run in dry-run mode first
4. ✅ Verify scope and dates are correct

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/admin/daily-programs/:userId/:date/main-objective/video` | Upload video file |
| PUT | `/api/admin/daily-programs/:userId/:date/main-objective` | Update objective details |
| GET | `/api/admin/users-simple?search=name` | Search users for dropdown |

---

## Best Practices

1. **Always run dry-run first** with batch scripts
2. **Test with a single user** before batch updates
3. **Use descriptive titles** that users understand
4. **Keep videos under 100MB** for faster loading
5. **Use landscape format** (16:9) for better display
6. **Compress videos** to reduce file size
7. **Test in the mobile app** after updating

---

## Examples

### Example 1: Update Monday Strength Training
```bash
# Using API
curl -X PUT https://api.diettemple.tn/api/admin/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-30/main-objective \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Strength Training Focus",
    "description": "Focus on heavy compound movements. Warm up properly before starting.",
    "videoUrl": "/media/videos/strength-warmup.mp4"
  }'
```

### Example 2: Same Objective for All Users Today
```typescript
// Using batch script - update exampleConfig4
{
  scope: 'all',
  dates: ['2026-06-27'],
  objective: {
    title: 'Today\'s Challenge',
    description: 'Push yourself and stay focused!',
    videoUrl: '/media/videos/daily_challenge.mp4'
  },
  dryRun: false
}
```

### Example 3: Update Elite Users for June
```typescript
// Using batch script - update exampleConfig3
{
  scope: 'level',
  level: 'Elite',
  dateRange: {
    startDate: '2026-06-01',
    endDate: '2026-06-30'
  },
  objective: {
    title: 'Elite June Challenge',
    description: 'Advanced training program for elite members.',
    videoUrl: '/media/videos/elite_june.mp4'
  },
  dryRun: false
}
```

---

## Questions?

If you have questions or issues:
1. Check the troubleshooting section
2. Review the API responses for error messages
3. Check MongoDB connection and daily program existence
4. Verify video file format and size
