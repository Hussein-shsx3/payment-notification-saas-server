// Lightweight FCM placeholder. In production you would:
// - Store device tokens per user (e.g. in a separate collection)
// - Send to those tokens using the FCM HTTP v1 API.

export interface PushPayload {
  title: string;
  body: string;
}

export const sendPushNotificationToUser = async (
  userId: string,
  payload: PushPayload
): Promise<void> => {
  // TODO: integrate real FCM once mobile app sends device tokens.
  // For now we just log so backend flow is complete.
  console.log(
    `FCM push (placeholder) to user ${userId}: ${payload.title} - ${payload.body}`
  );
};

