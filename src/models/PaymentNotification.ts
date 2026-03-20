import mongoose, { Document, Schema } from 'mongoose';

export type PaymentDirection = 'incoming' | 'outgoing';

export interface IPaymentNotification extends Document {
  userId: mongoose.Types.ObjectId;
  source: string;
  title: string;
  message: string;
  /** Money in vs money out (best-effort from notification text). */
  direction: PaymentDirection;
  amount?: number;
  currency?: string;
  transactionId?: string;
  forwardedToEmail: boolean;
  forwardedEmail?: string;
  emailSentAt?: Date;
  emailError?: string;
  receivedAt: Date;
  createdAt: Date;
}

const paymentNotificationSchema = new Schema<IPaymentNotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing'],
      default: 'incoming',
    },
    amount: { type: Number },
    currency: { type: String, trim: true, uppercase: true },
    transactionId: { type: String, trim: true, lowercase: true },
    forwardedToEmail: { type: Boolean, default: false },
    forwardedEmail: { type: String, trim: true, lowercase: true },
    emailSentAt: { type: Date },
    emailError: { type: String },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

paymentNotificationSchema.index({ userId: 1, receivedAt: -1 });
paymentNotificationSchema.index({ userId: 1, transactionId: 1 });

export const PaymentNotification = mongoose.model<IPaymentNotification>(
  'PaymentNotification',
  paymentNotificationSchema
);
