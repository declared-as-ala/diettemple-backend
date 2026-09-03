import mongoose, { Schema, Document } from 'mongoose';

export type AuditActionType =
  | 'renew'
  | 'change_level'
  | 'cancel'
  | 'assign_subscription'
  | 'assign_nutrition'
  | 'plan_override'
  | 'session_override'
  | 'note_added'
  | 'diet_update'
  | 'check_in_scheduled'
  | 'client_created'
  | 'client_update'
  | 'profile_photo_changed'
  | 'password_reset'
  | 'plan_assigned'
  | 'plan_renewed'
  | 'plan_replaced'
  | 'plan_cancelled'
  | 'plan_migrated';

export interface IAuditLog extends Document {
  actorAdminId: mongoose.Types.ObjectId;
  targetUserId: mongoose.Types.ObjectId;
  actionType: AuditActionType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema(
  {
    actorAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actionType: {
      type: String,
      enum: [
        'renew',
        'change_level',
        'cancel',
        'assign_subscription',
        'assign_nutrition',
        'plan_override',
        'session_override',
        'note_added',
        'diet_update',
        'check_in_scheduled',
        'client_created',
        'client_update',
        'profile_photo_changed',
        'password_reset',
        'plan_assigned',
        'plan_renewed',
        'plan_replaced',
        'plan_cancelled',
        'plan_migrated',
      ],
      required: true,
      index: true,
    },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
