import { Notification, User } from '../models';

/** Start of UTC calendar day */
function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole calendar days from `fromDay` to `toDay` (can be negative). */
function utcCalendarDaysBetween(end: Date, start: Date): number {
  const a = utcDayStart(end).getTime();
  const b = utcDayStart(start).getTime();
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

const REMINDER_TITLE = 'Subscription ending soon';
const buildMessage = (end: Date): string => {
  const d = end.toISOString().slice(0, 10);
  return `Your subscription ends on ${d} (UTC). Renew before then to keep payment capture and forwarding active.`;
};

/**
 * Sends one in-app notification per subscription period when the subscription
 * end date is exactly 2 calendar days ahead (UTC).
 */
export async function runSubscriptionExpiryReminders(): Promise<void> {
  const now = new Date();
  const users = await User.find({
    subscriptionEnd: { $gt: now },
    emailVerified: true,
  })
    .select('_id subscriptionEnd subscriptionExpiryReminderSentFor')
    .lean();

  for (const u of users) {
    const end = u.subscriptionEnd ? new Date(u.subscriptionEnd) : null;
    if (!end || Number.isNaN(end.getTime())) continue;

    if (utcCalendarDaysBetween(end, now) !== 2) continue;

    const sentFor = u.subscriptionExpiryReminderSentFor
      ? new Date(u.subscriptionExpiryReminderSentFor).getTime()
      : null;
    if (sentFor !== null && sentFor === end.getTime()) continue;

    await Notification.create({
      userId: u._id,
      title: REMINDER_TITLE,
      message: buildMessage(end),
      type: 'system',
    });

    await User.updateOne(
      { _id: u._id },
      { $set: { subscriptionExpiryReminderSentFor: end } }
    );
  }
}
