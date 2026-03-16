import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  fullName: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  emailVerified: boolean;
  verificationToken?: string;
  verificationTokenExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  subscriptionStart?: Date;
  subscriptionEnd?: Date;
  currentSubscriptionPrice?: number;
  currentSubscriptionCurrency?: string;
  /**
   * Current subscription monthly price (for quick display in lists).
   * Detailed history is stored in SubscriptionPayment documents.
   */
  targetEmail: string; // where to forward notifications; defaults to email
  lastSubscriptionWarningSentAt?: Date;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String, select: false },
    verificationTokenExpires: { type: Date, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    subscriptionStart: { type: Date },
    subscriptionEnd: { type: Date },
    currentSubscriptionPrice: { type: Number },
    currentSubscriptionCurrency: { type: String },
    targetEmail: { type: String, trim: true }, // defaults to email in pre-save
    lastSubscriptionWarningSentAt: { type: Date },
    refreshToken: { type: String, select: false },
  },
  { timestamps: true }
);

userSchema.index({ phoneNumber: 1 });
userSchema.index({ subscriptionEnd: 1 });

userSchema.pre('save', function (next) {
  if (this.isNew && !this.targetEmail) {
    this.targetEmail = this.email;
  }
  next();
});

export const User = mongoose.model<IUser>('User', userSchema);
