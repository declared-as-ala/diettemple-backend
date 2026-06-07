import mongoose, { Schema, Document } from 'mongoose';

export interface IBodyProgressPhoto extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date; // Date the photo was taken
  imageUrl: string; // Base64 or URL to the image
  notes?: string; // Optional notes about the photo
  weight?: number; // Optional weight at time of photo (kg)
  createdAt: Date;
  updatedAt: Date;
}

const BodyProgressPhotoSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
    },
    weight: {
      type: Number, // in kg
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one photo per user per date
BodyProgressPhotoSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model<IBodyProgressPhoto>('BodyProgressPhoto', BodyProgressPhotoSchema);
