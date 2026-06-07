import mongoose, { Schema, Document } from 'mongoose';

export interface ICoachEvent extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date; // Date of the event
  type: 'nutrition_visit' | 'coach_checkin' | 'assessment'; // Type of event
  title: string; // Event title
  description?: string; // Event description
  completed?: boolean; // Whether the event was completed
  completedAt?: Date; // When the event was completed
  createdAt: Date;
  updatedAt: Date;
}

const CoachEventSchema: Schema = new Schema(
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
    type: {
      type: String,
      enum: ['nutrition_visit', 'coach_checkin', 'assessment'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
CoachEventSchema.index({ userId: 1, date: 1 });
CoachEventSchema.index({ userId: 1, type: 1 });

export default mongoose.model<ICoachEvent>('CoachEvent', CoachEventSchema);
