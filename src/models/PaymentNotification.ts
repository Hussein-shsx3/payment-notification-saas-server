import mongoose, { Document, Schema } from 'mongoose';

export type PaymentDirection = 'incoming' | 'outgoing' | 'unknown';

export interface IPaymentNotification extends Document {
  userId: mongoose.Types.ObjectId;
  source: string;
  title: string;
  message: string;
  /** Money in vs money out vs unclear (user can fix unknown in the app). */
  direction: PaymentDirection;
  amount?: number;
  currency?: string;
  transactionId?: string;
  /** Dedupe key when transactionId is absent (sha256 of user + source + normalized message + amount). */
  contentHash?: string;
  /** Android StatusBarNotification key — stable while the same notification stays in the shade. */
  notificationKey?: string;
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
      enum: ['incoming', 'outgoing', 'unknown'],
      default: 'unknown',
    },
    amount: { type: Number },
    currency: { type: String, trim: true, uppercase: true },
    transactionId: { type: String, trim: true, lowercase: true },
    contentHash: { type: String, trim: true },
    notificationKey: { type: String, trim: true },
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
paymentNotificationSchema.index({ userId: 1, contentHash: 1 });
paymentNotificationSchema.index({ userId: 1, notificationKey: 1 }, { sparse: true });

export const PaymentNotification = mongoose.model<IPaymentNotification>(
  'PaymentNotification',
  paymentNotificationSchema
);
