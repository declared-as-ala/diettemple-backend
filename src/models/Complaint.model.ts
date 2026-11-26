import mongoose, { Schema, Document, Types } from 'mongoose';

export const COMPLAINT_CATEGORIES = ['technical', 'training', 'nutrition', 'billing', 'order', 'other'] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_STATUSES = ['new', 'in_progress', 'waiting_client', 'resolved', 'closed'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  technical: 'Problème technique',
  training: "Programme d'entraînement",
  nutrition: 'Programme nutritionnel',
  billing: 'Abonnement et paiement',
  order: 'Commande et livraison',
  other: 'Autre',
};

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: 'Nouvelle',
  in_progress: 'En cours de traitement',
  waiting_client: 'En attente de réponse',
  resolved: 'Résolue',
  closed: 'Fermée',
};

export interface IComplaintAttachment {
  _id: Types.ObjectId;
  /** Key in the PRIVATE bucket (never a public URL): files are only served through the authenticated API. */
  key: string;
  name: string;
  mime: string;
  size: number;
}

export interface IComplaintMessage {
  _id: Types.ObjectId;
  authorType: 'client' | 'admin';
  authorId: Types.ObjectId;
  body: string;
  /** Internal admin note: never shown to the client, never counted as unread, never emailed. */
  internal: boolean;
  attachments: IComplaintAttachment[];
  createdAt: Date;
}

export interface IComplaint extends Document {
  reference: string;
  userId: Types.ObjectId;
  category: ComplaintCategory;
  subject: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  messages: IComplaintMessage[];
  unreadForAdmin: number;
  unreadForClient: number;
  lastMessageAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, maxlength: 120 },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: true }
);

const MessageSchema = new Schema(
  {
    authorType: { type: String, enum: ['client', 'admin'], required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, default: '', maxlength: 5000 },
    internal: { type: Boolean, default: false },
    attachments: { type: [AttachmentSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ComplaintSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: COMPLAINT_CATEGORIES, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 140 },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'new' },
    priority: { type: String, enum: COMPLAINT_PRIORITIES, default: 'normal' },
    messages: { type: [MessageSchema], default: [] },
    unreadForAdmin: { type: Number, default: 0 },
    unreadForClient: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

ComplaintSchema.index({ userId: 1, lastMessageAt: -1 });
ComplaintSchema.index({ status: 1, lastMessageAt: -1 });
ComplaintSchema.index({ category: 1 });
ComplaintSchema.index({ priority: 1 });
ComplaintSchema.index({ unreadForAdmin: 1 });

export default mongoose.model<IComplaint>('Complaint', ComplaintSchema);
