import mongoose, { Schema, Document } from 'mongoose';

export interface ILevelHomeContent extends Document {
  levelSlug: string;
  title?: string;
  instructions?: string;
  videoUrl?: string;
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<ILevelHomeContent>('LevelHomeContent', LevelHomeContentSchema);
