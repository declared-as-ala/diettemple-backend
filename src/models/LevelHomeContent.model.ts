import mongoose, { Schema, Document } from 'mongoose';

export interface ILevelHomeContent extends Document {
  levelSlug: string;
  title?: string;
  instructions?: string;
  videoUrl?: string;
  videoVariants?: Array<{ quality: string; url: string; bytes: number; width: number; height: number; bitrateKbps: number }>;
  videoPosterUrl?: string;
  videoHlsUrl?: string;
  videoDurationSec?: number;
  videoOptimization?: { status: 'pending' | 'processing' | 'ready' | 'failed'; sourceKey?: string; folder?: string; sourceBytes?: number; sourceCodec?: string; sourceBitrateKbps?: number; optimizedBytes?: number; error?: string; updatedAt?: Date };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LevelHomeContentSchema = new Schema(
  {
    levelSlug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      unique: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    videoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    videoVariants: {
      type: [new Schema({ quality: String, url: String, bytes: Number, width: Number, height: Number, bitrateKbps: Number }, { _id: false })],
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<ILevelHomeContent>('LevelHomeContent', LevelHomeContentSchema);
