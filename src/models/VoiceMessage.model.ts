import mongoose, { Schema, Document, Types } from 'mongoose';

/** A coach message (voice and/or text) attached to ONE exercise of ONE client. Audio lives in the private bucket. */
export interface IVoiceMessage extends Document {
  /** null = message attached to the exercise itself: every client doing this exercise sees it. */
  clientId: Types.ObjectId | null;
  /** For exercise-wide messages: the clients who opened it. */
  readBy: Types.ObjectId[];
  exerciseId: Types.ObjectId;
  sessionId?: Types.ObjectId | null;
  programId?: Types.ObjectId | null;
  authorId: Types.ObjectId;
  body: string;
  audio?: { key: string; mime: string; size: number; durationSec: number } | null;
  /** Set when the client has opened the message. */
  readAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const VoiceMessageSchema = new Schema<IVoiceMessage>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    exerciseId: { type: Schema.Types.ObjectId, ref: 'Exercise', required: true },
    sessionId: { type: Schema.Types.ObjectId, default: null },
    programId: { type: Schema.Types.ObjectId, default: null },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, default: '', maxlength: 1000, trim: true },
    audio: {
      type: new Schema({ key: String, mime: String, size: Number, durationSec: Number }, { _id: false }),
      default: null,
    },
    readAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

VoiceMessageSchema.index({ clientId: 1, exerciseId: 1, createdAt: 1 });
VoiceMessageSchema.index({ clientId: 1, readAt: 1, deletedAt: 1 });
VoiceMessageSchema.index({ exerciseId: 1, clientId: 1, deletedAt: 1 });

export default mongoose.model<IVoiceMessage>('VoiceMessage', VoiceMessageSchema);
