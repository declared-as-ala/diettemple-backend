import mongoose, { Schema, Document } from 'mongoose';

export interface ILandingVideo extends Document {
  gender: 'homme' | 'femme';
  title: string;
  description: string;
  videoUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LandingVideoSchema = new Schema(
  {
    gender: {
      type: String,
      enum: ['homme', 'femme'],
      required: true,
      unique: true,
      index: true,
    },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    videoUrl: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<ILandingVideo>('LandingVideo', LandingVideoSchema);
