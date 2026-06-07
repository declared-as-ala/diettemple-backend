import mongoose, { Schema, Document } from 'mongoose';

export interface ILead extends Document {
  name: string;
  email: string;
  phone: string;
  goal: string;
  plan?: string;
  gender?: string;
  status: 'new' | 'contacted' | 'converted' | 'lost';
  notes?: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema: Schema = new Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    goal:  { type: String, default: 'fat-loss', trim: true },
    plan:  { type: String, default: 'ascension', trim: true },
    status: {
      type: String,
      enum: ['new', 'contacted', 'converted', 'lost'],
      default: 'new',
    },
    gender: { type: String, enum: ['homme', 'femme', ''], default: '' },
    notes:  { type: String, default: '' },
    source: { type: String, default: 'website', trim: true },
  },
  { timestamps: true }
);

LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ status: 1 });

export default mongoose.model<ILead>('Lead', LeadSchema);
