/**
 * Gym Presence Verification attempt — stores each verification request for audit/logs.
 * Used by POST /api/verification/gym-presence.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface VerificationCheckRecord {
  aiScene: boolean;
  gpsProvided: boolean;
  geofenceMatch?: boolean;
  nearestGymDistanceMeters?: number | null;
  uploadSource?: string;
}

export interface IGymPresenceVerification extends Document {
  userId: mongoose.Types.ObjectId;
  verified: boolean;
  confidence: number;
  topPrediction: string;
  reason: string;
  checks: VerificationCheckRecord;
  /** Optional: path under storage if STORE_VERIFICATION_IMAGES=true */
  imagePath?: string;
  serverTimestamp: Date;
  clientTimestamp?: Date;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  /** For manual review: true when confidence is in borderline range (e.g. 0.35–0.5) */
  manualReviewFlag?: boolean;
  /** Model name/version used for classification (stored as classificationModel to avoid Mongoose Document.model) */
  classificationModel?: string;
  /** Top 3 predictions (label + score) */
  topPredictions?: Array<{ label: string; score: number }>;
  /** Threshold and margin used */
  thresholds?: { threshold: number; margin: number };
  /** camera | gallery | unknown */
  uploadSource?: string;
  /** high | medium | low */
  trustLevel?: string;
  /** Geofence match result */
  geofenceMatch?: boolean;
  /** Distance to nearest gym in meters (if gyms configured) */
  nearestGymDistanceMeters?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const GymPresenceVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    verified: { type: Boolean, required: true },
    confidence: { type: Number, required: true },
    topPrediction: { type: String, required: true },
    reason: { type: String, required: true },
    checks: {
      aiScene: { type: Boolean, required: true },
      gpsProvided: { type: Boolean, required: true },
      geofenceMatch: { type: Boolean },
      nearestGymDistanceMeters: { type: Number },
      uploadSource: { type: String },
    },
    imagePath: { type: String },
    serverTimestamp: { type: Date, required: true, default: () => new Date() },
    clientTimestamp: { type: Date },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number },
    manualReviewFlag: { type: Boolean },
    classificationModel: { type: String },
    topPredictions: [{ label: { type: String }, score: { type: Number } }],
    thresholds: { threshold: { type: Number }, margin: { type: Number } },
    uploadSource: { type: String },
    trustLevel: { type: String },
    geofenceMatch: { type: Boolean },
    nearestGymDistanceMeters: { type: Number },
  },
  { timestamps: true }
);

GymPresenceVerificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IGymPresenceVerification>(
  'GymPresenceVerification',
  GymPresenceVerificationSchema
);
