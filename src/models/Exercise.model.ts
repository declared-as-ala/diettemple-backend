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
  defaultWeight?: number; // in kg - default weight for this exercise
  description?: string;
  imageUrl?: string;
  /** How the video is provided: upload (file), youtube (URL), or external (other URL). */
  videoSource?: VideoSourceType;
  /** Public URL for playback: YouTube URL, external URL, or /api/videos/... for uploads. */
  videoUrl?: string;
  /** Stored filename for uploaded videos (under storage/video). */
  videoFilePath?: string;
  /** Optimised H.264 renditions (240/360/540) generated in the background from the original upload. */
  videoVariants?: Array<{ quality: string; url: string; bytes: number; width: number; height: number; bitrateKbps: number }>;
  videoPosterUrl?: string;
  /** HLS master playlist (same encodes), for longer videos / adaptive streaming. */
  videoHlsUrl?: string;
  videoDurationSec?: number;
  videoOptimization?: {
    status: 'pending' | 'processing' | 'ready' | 'failed';
    sourceKey?: string;
    folder?: string;
    sourceBytes?: number;
    sourceCodec?: string;
    sourceBitrateKbps?: number;
    optimizedBytes?: number;
    error?: string;
    updatedAt?: Date;
  };
  instruction?: string;
  message?: string;
  warmupInstruction?: string;
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
    videoVariants: {
      type: [
        new Schema(
          { quality: String, url: String, bytes: Number, width: Number, height: Number, bitrateKbps: Number },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    videoPosterUrl: { type: String },
    videoHlsUrl: { type: String },
    videoDurationSec: { type: Number },
    videoOptimization: {
      status: { type: String, enum: ['pending', 'processing', 'ready', 'failed'] },
      sourceKey: String,
      folder: String,
      sourceBytes: Number,
      sourceCodec: String,
      sourceBitrateKbps: Number,
      optimizedBytes: Number,
      error: String,
      updatedAt: Date,
    },
    instruction: {
      type: String,
    },
    message: {
      type: String,
    },
    warmupInstruction: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IExercise>('Exercise', ExerciseSchema);

