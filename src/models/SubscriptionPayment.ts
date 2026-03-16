import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionPayment extends Document {
  userId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
}

const subscriptionPaymentSchema = new Schema<ISubscriptionPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

subscriptionPaymentSchema.index({ userId: 1, periodStart: -1 });

export const SubscriptionPayment = mongoose.model<ISubscriptionPayment>(
  'SubscriptionPayment',
  subscriptionPaymentSchema
);

