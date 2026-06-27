# Quick Start: Daily Objectives Management

## 3 Ways to Update "Objectif Principal" Video

---

## Method 1: Admin Dashboard UI ⭐ (Easiest)

```
1. Go to: Admin Dashboard → Daily Objectives
2. Search user by name/email
3. Select date
4. Upload video file (MP4, WebM)
5. Fill title & description
6. Click "Update Daily Objective"
✓ Done! Video appears in app
```

**Best for:** Single updates, manual management

---

## Method 2: API Calls

### Upload Video
```bash
curl -X POST \
  https://api.diettemple.tn/api/admin/daily-programs/USER_ID/DATE/main-objective/video \
  -H "Authorization: Bearer TOKEN" \
  -F "video=@video.mp4"
```

### Update Objective
```bash
curl -X PUT \
  https://api.diettemple.tn/api/admin/daily-programs/USER_ID/DATE/main-objective \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Objectif Principal",
    "description": "Your instructions here",
    "videoUrl": "/media/videos/objective.mp4"
  }'
```

**Best for:** Automation, integration with other systems

---

## Method 3: Batch Update Script 🚀

### For Multiple Users/Dates

```bash
# 1. Edit the script
nano src/scripts/updateDailyObjectives.ts

# 2. Choose your config (see options below)

# 3. Preview changes (dry-run)
npm run update:daily-objectives

# 4. Apply changes
npm run update:daily-objectives
```

### Script Options

#### All users, all future dates
```typescript
scope: 'all'
dates: ['all-future']
```

#### Specific users, specific dates
```typescript
scope: 'users'
userIds: ['ID1', 'ID2']
dates: ['2026-06-27', '2026-06-28']
```

#### All users with a level
```typescript
scope: 'level'
level: 'Elite'
dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' }
```

#### Specific date, all users
```typescript
scope: 'all'
dates: ['2026-06-27']
```

**Best for:** Bulk updates, many users

---

## What Gets Updated

### Before
```json
{
  "mainObjective": {
    "title": "Old title",
    "description": "Old instructions",
    "videoUrl": null
  }
}
```

### After (Your Update)
```json
{
  "mainObjective": {
    "title": "Objectif Principal",
    "description": "Complete your session with proper form",
    "videoUrl": "/media/videos/daily-programs/USER_ID/DATE/video.mp4"
  }
}
```

---

## What Users See in App

**Home Page:**
```
┌─────────────────────────────────┐
│  📱 Home Dashboard              │
├─────────────────────────────────┤
│  • Header (Welcome, etc)        │
│  • Today Plan Card              │
│  • Nutrition Card               │
│                                 │
│  🎬 Objectif Principal          │ ← YOUR CONTENT
│  ┌───────────────────────────┐  │
│  │  [PLAY VIDEO]             │  │
│  │                           │  │
│  │  Objectif Principal       │  │
│  │  Complete your session... │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

## Requirements

| Method | Needed |
|--------|--------|
| **Dashboard UI** | Admin account, browser |
| **API Calls** | Bearer token, cURL/Postman |
| **Batch Script** | MongoDB running, Node.js, .env |

---

## File Size & Format

**Video:**
- Format: MP4, WebM
- Max size: 500MB
- Recommended: 16:9 aspect ratio
- Recommended: 50-100MB after compression

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Video doesn't appear | Check date, check URL, verify videoUrl not null |
| Upload fails | Check file size <500MB, verify it's a video |
| Batch script fails | Check MongoDB running, verify .env MONGODB_URI |
| User not found | Check user ID format, search via dashboard |

---

## API Endpoints

```
POST   /api/admin/daily-programs/{userId}/{date}/main-objective/video
PUT    /api/admin/daily-programs/{userId}/{date}/main-objective
GET    /api/admin/users-simple?search=name (for user lookup)
```

---

## Date Format

```
YYYY-MM-DD

Examples:
✓ 2026-06-27
✓ 2026-12-25
✗ 27/06/2026  ← Wrong
✗ 06-27-2026  ← Wrong
```

---

## User ID Format

```
MongoDB ObjectId (24 hex characters)

Example:
64f8a3b2c1d2e3f4g5h6i7j8

Get from:
• Admin Dashboard → Users page (click user, copy ID)
• Search via /api/admin/users-simple endpoint
```

---

## Example: Update One User

### Using Dashboard (2 min)
1. Go to Daily Objectives
2. Search "john.doe@example.com"
3. Pick date: 2026-06-27
4. Upload video.mp4
5. Title: "Monday Focus"
6. Description: "Stay strong!"
7. Click Update
✓ Done

### Using API (5 min)
```bash
# 1. Upload video
curl -X POST https://api.diettemple.tn/api/admin/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/main-objective/video \
  -H "Authorization: Bearer TOKEN" \
  -F "video=@video.mp4"

# 2. Update details
curl -X PUT https://api.diettemple.tn/api/admin/daily-programs/64f8a3b2c1d2e3f4g5h6i7j8/2026-06-27/main-objective \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Monday Focus","description":"Stay strong!","videoUrl":"/media/videos/..."}'
```

### Using Batch Script (Overkill for 1 user, better for 100+ users)

---

## Recommended Approach

- **1-5 updates:** Use Dashboard UI
- **5-50 updates:** Use API calls
- **50+ updates:** Use Batch Script

---

## Need Help?

See full guide: `DAILY_OBJECTIVES_GUIDE.md`

Questions about:
- Database schema? → See GUIDE, "Database Schema" section
- Examples? → See GUIDE, "Examples" section
- Troubleshooting? → See GUIDE, "Troubleshooting" section
