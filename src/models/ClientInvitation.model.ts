import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A pending/finished invitation for a future client. The client account does NOT exist until the invitation is accepted.
 * Only a SHA-256 hash of the token is stored (never the token), and a consumed or replaced token is remembered only as a hash
 * so the activation page can say "already used" / "replaced by a newer link" instead of a generic error.
 */
export type InvitationStatus = 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked' | 'failed';

export interface IInvitationEvent {
  type: 'created' | 'sent' | 'send_failed' | 'resent' | 'revoked' | 'accepted' | 'expired';
  at: Date;
  by?: Types.ObjectId;
  note?: string;
}

export interface IClientInvitation extends Document {
  /** Normalized: trimmed + lower-case. */
  email: string;
  /** Optional, used only to personalize the welcome email. */
  name?: string;
  status: InvitationStatus;
  /** SHA-256 (hex) of the current token. Removed once the invitation is accepted. */
  tokenHash?: string;
  /** Hash of the token that was consumed by the acceptance. */
  consumedTokenHash?: string;
  /** Hashes of tokens invalidated by a re-send (most recent last, capped). */
  previousTokenHashes: string[];
  expiresAt: Date;
  invitedBy: Types.ObjectId;
  sentAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  sendCount: number;
  lastSendError?: string;
  /** The account created when the invitation was accepted. */
  userId?: Types.ObjectId;
  events: IInvitationEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const InvitationEventSchema = new Schema(
  {
    type: { type: String, enum: ['created', 'sent', 'send_failed', 'resent', 'revoked', 'accepted', 'expired'], required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, maxlength: 300 },
  },
  { _id: false }
);

const ClientInvitationSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, trim: true, maxlength: 80 },
    status: { type: String, enum: ['pending', 'sent', 'accepted', 'expired', 'revoked', 'failed'], default: 'pending', index: true },
    tokenHash: { type: String, index: true, sparse: true },
    consumedTokenHash: { type: String, index: true, sparse: true },
    previousTokenHashes: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentAt: { type: Date },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    sendCount: { type: Number, default: 0 },
    lastSendError: { type: String, maxlength: 300 },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    events: { type: [InvitationEventSchema], default: [] },
  },
  { timestamps: true }
);

// At most ONE open invitation per email, enforced by the database (accepted / revoked / expired ones are history).
ClientInvitationSchema.index(
  { email: 1 },
  { name: 'email_open_invitation_unique', unique: true, partialFilterExpression: { status: { $in: ['pending', 'sent', 'failed'] } } }
);
ClientInvitationSchema.index({ email: 1, createdAt: -1 }, { name: 'email_history' });
ClientInvitationSchema.index({ createdAt: -1 });

export default mongoose.model<IClientInvitation>('ClientInvitation', ClientInvitationSchema);
