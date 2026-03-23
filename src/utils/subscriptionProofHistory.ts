import mongoose from 'mongoose';

export type ClientSubscriptionProofItem = {
  id: string;
  url: string;
  uploadedAt: string | null;
  reviewedAt: string | null;
};

type LeanProofEntry = {
  _id?: mongoose.Types.ObjectId;
  url: string;
  publicId?: string;
  uploadedAt?: Date;
  reviewedAt?: Date;
};

/** Safe list for API (newest first). Works with legacy single-url users until migrated. */
export function normalizeClientProofHistory(user: {
  subscriptionPaymentProofHistory?: LeanProofEntry[] | null;
  subscriptionPaymentProofUrl?: string;
  subscriptionPaymentProofUploadedAt?: Date;
  subscriptionPaymentProofReviewedAt?: Date;
}): ClientSubscriptionProofItem[] {
  const hist = user.subscriptionPaymentProofHistory;
  if (Array.isArray(hist) && hist.length > 0) {
    return [...hist]
      .map((h) => ({
        id: String(h._id),
        url: h.url,
        uploadedAt: h.uploadedAt ? new Date(h.uploadedAt).toISOString() : null,
        reviewedAt: h.reviewedAt ? new Date(h.reviewedAt).toISOString() : null,
      }))
      .sort(
        (a, b) =>
          new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime()
      );
  }
  if (user.subscriptionPaymentProofUrl) {
    return [
      {
        id: 'legacy',
        url: user.subscriptionPaymentProofUrl,
        uploadedAt: user.subscriptionPaymentProofUploadedAt
          ? new Date(user.subscriptionPaymentProofUploadedAt).toISOString()
          : null,
        reviewedAt: user.subscriptionPaymentProofReviewedAt
          ? new Date(user.subscriptionPaymentProofReviewedAt).toISOString()
          : null,
      },
    ];
  }
  return [];
}

export const SUBSCRIPTION_PROOF_HISTORY_MAX = 40;
