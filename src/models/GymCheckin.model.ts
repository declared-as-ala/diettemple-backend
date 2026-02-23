import mongoose, { Schema, Document } from 'mongoose';

export interface IGymCheckin extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string; // YYYY-MM-DD local — one check-in per user per day
  sessionId?: mongoose.Types.ObjectId; // optional: first session of the day (analytics)
  verifiedAt: Date;
  proofType: 'photo' | 'gps';
  proofUrl?: string; // photo path under /media
  gpsCoords?: { lat: number; lng: number };
  deviceInfo?: string;
  aiScore?: number;
  gpsDistance?: number; // meters, if checked
  method?: 'photo' | 'gps' | 'fallback';
  createdAt: Date;
  updatedAt: Date;
}

const GymCheckinSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'SessionTemplate', required: false },
    verifiedAt: { type: Date, required: true, default: () => new Date() },
    proofType: { type: String, enum: ['photo', 'gps'], required: true, default: 'photo' },
    proofUrl: { type: String },
    gpsCoords: {
      lat: { type: Number },
      lng: { type: Number },
    },
    deviceInfo: { type: String },
    aiScore: { type: Number },
    gpsDistance: { type: Number },
    method: { type: String, enum: ['photo', 'gps', 'fallback'] },
  },
  { timestamps: true }
);

GymCheckinSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export default mongoose.model<IGymCheckin>('GymCheckin', GymCheckinSchema);
