import mongoose, { Schema, Document } from 'mongoose';

const SubscriptionHistorySchema = new Schema(
  {
    action: { type: String, required: true }, // renew | change_level | cancel | assign
    fromLevelTemplateId: { type: Schema.Types.ObjectId, ref: 'LevelTemplate' },
    toLevelTemplateId: { type: Schema.Types.ObjectId, ref: 'LevelTemplate' },
    date: { type: Date, default: Date.now },
    adminId: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { _id: false }
);

export interface ISubscriptionHistory {
  action: string;
  fromLevelTemplateId?: mongoose.Types.ObjectId;
  toLevelTemplateId?: mongoose.Types.ObjectId;
  date: Date;
  adminId?: mongoose.Types.ObjectId;
  note?: string;
}

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  levelTemplateId: mongoose.Types.ObjectId;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELED';
  startAt: Date;
  endAt: Date;
  autoRenew: boolean;
  history: ISubscriptionHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    levelTemplateId: { type: Schema.Types.ObjectId, ref: 'LevelTemplate', required: true, index: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'CANCELED'],
      default: 'ACTIVE',
      index: true,
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    autoRenew: { type: Boolean, default: false },
    history: { type: [SubscriptionHistorySchema], default: [] },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index({ endAt: 1, status: 1 });

export default mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
