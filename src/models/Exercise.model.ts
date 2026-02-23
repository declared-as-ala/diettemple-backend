import mongoose, { Schema, Document } from 'mongoose';

export type VideoSourceType = 'upload' | 'youtube' | 'external';

export interface IExercise extends Document {
  name: string;
  muscleGroup: string;
  equipment?: 'machine' | 'dumbbell' | 'barbell' | 'bodyweight' | 'cable';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  reps?: number;
  sets?: number;
  duration?: number; // in seconds
  restTime?: number; // in seconds
  defaultWeight?: number; // in kg - default weight for this exercise
  description?: string;
  imageUrl?: string;
  /** How the video is provided: upload (file), youtube (URL), or external (other URL). */
  videoSource?: VideoSourceType;
  /** Public URL for playback: YouTube URL, external URL, or /api/videos/... for uploads. */
  videoUrl?: string;
  /** Stored filename for uploaded videos (under storage/video). */
  videoFilePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExerciseSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    muscleGroup: {
      type: String,
      required: true,
      trim: true,
    },
    equipment: {
      type: String,
      enum: ['machine', 'dumbbell', 'barbell', 'bodyweight', 'cable'],
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
    },
    reps: {
      type: Number,
    },
    sets: {
      type: Number,
    },
    duration: {
      type: Number, // in seconds
    },
    restTime: {
      type: Number, // in seconds
    },
    defaultWeight: {
      type: Number, // in kg
    },
    description: {
      type: String,
    },
    imageUrl: {
      type: String,
    },
    videoSource: {
      type: String,
      enum: ['upload', 'youtube', 'external'],
    },
    videoUrl: {
      type: String,
    },
    videoFilePath: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IExercise>('Exercise', ExerciseSchema);

