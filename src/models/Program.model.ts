import mongoose, { Schema, Document } from 'mongoose';
import { IWeeklyTemplate } from './WeeklyTemplate.model';

export interface IProgram extends Document {
  userId: mongoose.Types.ObjectId;
  startDate: Date;
  durationWeeks: number;
  weeklyTemplateId: mongoose.Types.ObjectId | IWeeklyTemplate;
  completedWeeks: number[];
  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED';
  createdAt: Date;
  updatedAt: Date;
}

const ProgramSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    durationWeeks: {
      type: Number,
      default: 6,
    },
    weeklyTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'WeeklyTemplate',
      required: true,
    },
    completedWeeks: {
      type: [Number],
      default: [],
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'PAUSED'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IProgram>('Program', ProgramSchema);



