import mongoose, { Schema, Document } from 'mongoose';
import { ISession } from './Session.model';

export interface IWeeklyTemplate extends Document {
  name: string;
  monday: mongoose.Types.ObjectId | ISession | null;
  tuesday: mongoose.Types.ObjectId | ISession | null;
  wednesday: mongoose.Types.ObjectId | ISession | null;
  thursday: mongoose.Types.ObjectId | ISession | null;
  friday: mongoose.Types.ObjectId | ISession | null;
  saturday: mongoose.Types.ObjectId | ISession | null;
  sunday: mongoose.Types.ObjectId | ISession | null;
  createdAt: Date;
  updatedAt: Date;
}

const WeeklyTemplateSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    monday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    tuesday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    wednesday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    thursday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    friday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    saturday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
    sunday: {
      type: Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IWeeklyTemplate>('WeeklyTemplate', WeeklyTemplateSchema);






