import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportMessage extends Document {
  userId: mongoose.Types.ObjectId;
  /** Who wrote this message */
  from: 'user' | 'admin';
  body: string;
  createdAt: Date;
}

const supportMessageSchema = new Schema<ISupportMessage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    from: { type: String, enum: ['user', 'admin'], required: true },
    body: { type: String, required: true, trim: true, maxlength: 8000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

supportMessageSchema.index({ userId: 1, createdAt: -1 });

export const SupportMessage = mongoose.model<ISupportMessage>('SupportMessage', supportMessageSchema);
