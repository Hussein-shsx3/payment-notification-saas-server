import nodemailer from 'nodemailer';
import { config } from '../config';

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async (options: SendMailOptions): Promise<void> => {
  await transporter.sendMail({
    from: config.email.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
};

export const sendVerificationEmail = async (email: string, token: string): Promise<void> => {
  const url = `${config.urls.frontend}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    html: `
      <p>Please verify your email by clicking the link below:</p>
      <a href="${url}">${url}</a>
      <p>This link expires in 24 hours.</p>
    `,
    text: `Verify your email: ${url}`,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  const url = `${config.urls.frontend}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password',
    html: `
      <p>You requested a password reset. Click the link below:</p>
      <a href="${url}">${url}</a>
      <p>This link expires in 1 hour.</p>
    `,
    text: `Reset password: ${url}`,
  });
};

export const sendPaymentNotificationEmail = async (
  to: string,
  source: string,
  title: string,
  message: string,
  receivedAt: Date
): Promise<void> => {
  const dateStr = new Date(receivedAt).toLocaleString();
  await sendEmail({
    to,
    subject: `Payment notification: ${title}`,
    html: `
      <h3>Payment notification</h3>
      <p><strong>Source:</strong> ${source}</p>
      <p><strong>Title:</strong> ${title}</p>
      <p><strong>Message:</strong></p>
      <p>${message}</p>
      <p><strong>Received at:</strong> ${dateStr}</p>
    `,
    text: `Source: ${source}\nTitle: ${title}\nMessage: ${message}\nReceived at: ${dateStr}`,
  });
};
