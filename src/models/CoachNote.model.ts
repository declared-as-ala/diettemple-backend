import mongoose, { Schema, Document } from 'mongoose';

export interface ICoachNote extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  title?: string;
  message: string;
  createdByAdminId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CoachNoteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true, index: true },
    title: { type: String, trim: true },
    message: { type: String, required: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

CoachNoteSchema.index({ userId: 1, date: -1 });

export default mongoose.model<ICoachNote>('CoachNote', CoachNoteSchema);
