# Video Upload and Serving Fix

## Problem Description

When uploading videos through the admin dashboard:
1. ✅ Video uploads successfully and shows "Video uploaded successfully" message
2. ✅ Video file appears in `backend/storage/video` folder
3. ❌ After refresh, video doesn't appear in the UI
4. ❌ Getting 404 errors when trying to access videos:
   - `GET /videos/exercises/chest/dumbbell-bench-press.mp4 404`
   - `GET /api/videos/exercise_1769975731713-811506295.mp4 404`

## Root Causes

1. **Static File Serving Path Issue**: The static file serving was using a relative path that might not resolve correctly in production/compiled code
2. **Missing Route for Old Seed Data**: Old seed data uses paths like `/videos/exercises/...` which weren't being served
3. **No Error Logging**: No logging to verify files were being saved correctly

## Fixes Applied

### 1. Fixed Static File Serving (`backend/src/index.ts`)

**Before:**
```typescript
app.use('/api/videos', express.static(path.join(__dirname, '../storage/video')));
```

**After:**
```typescript
// Use absolute path for reliability
const videoStoragePath = path.resolve(__dirname, '../storage/video');
// Ensure directory exists
if (!fs.existsSync(videoStoragePath)) {
  fs.mkdirSync(videoStoragePath, { recursive: true });
}

// Serve videos with proper headers
app.use('/api/videos', express.static(videoStoragePath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));
```

### 2. Added Route for Old Seed Data Paths

Added backward compatibility route to handle old seed data paths:
```typescript
app.get('/videos/exercises/:muscleGroup/:filename', (req, res) => {
  // Try to find file in storage/video directory
  // Returns 404 if not found
});
```

### 3. Enhanced Video Upload Route (`backend/src/routes/admin.routes.ts`)

Added logging and verification:
```typescript
if (req.file) {
  // Verify file was saved
  if (!fs.existsSync(req.file.path)) {
    return res.status(500).json({ message: 'Video file was not saved correctly' });
  }
  
  // Log upload details for debugging
  console.log(`✅ Video uploaded: ${req.file.filename}`);
  console.log(`✅ Video path: ${req.file.path}`);
  console.log(`✅ Video URL: ${videoUrl}`);
  
  // Explicitly return videoUrl in response
  res.json({ 
    exercise: updatedExercise, 
    message: 'Video uploaded successfully',
    videoUrl: videoUrl
  });
}
```

## How It Works Now

1. **Video Upload Flow**:
   - Admin uploads video file through dashboard
   - File is saved to `backend/storage/video/exercise_{timestamp}-{random}.mp4`
   - Database stores path as `/api/videos/exercise_{timestamp}-{random}.mp4`
   - Response includes the `videoUrl` for immediate use

2. **Video Serving**:
   - Videos are served at `/api/videos/{filename}`
   - Static files are served from `backend/storage/video/` directory
   - Proper Content-Type headers are set
   - CORS headers allow cross-origin access

3. **Backward Compatibility**:
   - Old seed data paths (`/videos/exercises/...`) are handled
   - System tries to find files in storage directory

## Testing

After applying the fix:

1. **Upload a new video**:
   - Go to admin dashboard → Exercises
   - Upload a video for an exercise
   - Check console logs for upload confirmation
   - Verify file exists in `backend/storage/video/`

2. **Verify video is accessible**:
   - Refresh the exercises page
   - Video should appear and be playable
   - Check browser network tab - should see `200 OK` for video requests

3. **Check backend logs**:
   - Should see: `✅ Video uploaded: exercise_...`
   - Should see: `✅ Serving videos from: /path/to/storage/video`

## Troubleshooting

If videos still don't appear:

1. **Check file permissions**: Ensure `storage/video` directory is writable
2. **Check file exists**: Verify file is actually in `backend/storage/video/`
3. **Check database**: Verify `exercise.videoUrl` is set correctly in MongoDB
4. **Check backend logs**: Look for upload confirmation messages
5. **Check frontend API calls**: Verify frontend is using correct API base URL
6. **Check CORS**: Ensure CORS is properly configured for video serving

## File Structure

```
backend/
├── src/
│   ├── index.ts (static file serving)
│   └── routes/
│       └── admin.routes.ts (video upload route)
└── storage/
    └── video/ (video files stored here)
        ├── exercise_1234567890-123456789.mp4
        └── ...
```

## API Endpoints

- **Upload Video**: `POST /api/admin/exercises/:id/video`
  - Body: `FormData` with `video` field (file)
  - Response: `{ exercise, message, videoUrl }`

- **Serve Video**: `GET /api/videos/{filename}`
  - Returns video file with proper headers

- **Old Paths (backward compatibility)**: `GET /videos/exercises/:muscleGroup/:filename`
  - Tries to find file in storage directory
