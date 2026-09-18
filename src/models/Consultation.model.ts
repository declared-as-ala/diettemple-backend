import mongoose, { Schema, Document } from 'mongoose';

export interface IConsultation extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  weight: number; // in kg
  muscleMassPercentage: number; // in %
  bodyFatPercentage: number; // in %
  notes?: string;
  createdByStaffId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ConsultationSchema = new Schema(
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
      default: Date.now,
      index: true,
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
    },
    muscleMassPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    bodyFatPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdByStaffId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

ConsultationSchema.index({ userId: 1, date: -1 });

export default mongoose.model<IConsultation>('Consultation', ConsultationSchema);
