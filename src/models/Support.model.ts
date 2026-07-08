import mongoose, { Schema, Document } from 'mongoose';

export interface ISupport extends Document {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: 'billing' | 'technical' | 'general' | 'feedback';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupportSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    category: {
      type: String,
      enum: ['billing', 'technical', 'general', 'feedback'],
      default: 'general',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
    },
    adminNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

SupportSchema.index({ createdAt: -1 });
SupportSchema.index({ status: 1 });
SupportSchema.index({ priority: 1 });

export default mongoose.model<ISupport>('Support', SupportSchema);
