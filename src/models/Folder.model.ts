import mongoose, { Schema, Document } from 'mongoose';

export interface IFolder extends Document {
  name: string;
  description?: string;
  type: 'plan' | 'session';
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['plan', 'session'],
      required: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

FolderSchema.index({ type: 1, order: 1 });

export default mongoose.model<IFolder>('Folder', FolderSchema);
