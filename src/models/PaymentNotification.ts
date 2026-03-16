import mongoose, { Document, Schema } from 'mongoose';

export interface IPaymentNotification extends Document {
  userId: mongoose.Types.ObjectId;
  source: string;
  title: string;
  message: string;
  receivedAt: Date;
  createdAt: Date;
}

const paymentNotificationSchema = new Schema<IPaymentNotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

paymentNotificationSchema.index({ userId: 1, receivedAt: -1 });

export const PaymentNotification = mongoose.model<IPaymentNotification>(
  'PaymentNotification',
  paymentNotificationSchema
);
