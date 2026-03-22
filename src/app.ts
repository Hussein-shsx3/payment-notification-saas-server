import './loadEnv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { verifyGmailSmtpConnection } from './services/verificationEmail';
import routes from './routes';
import { errorHandler, notFound } from './middleware';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/** Debug: confirms Gmail env is visible to the process (no secrets exposed). */
app.get('/health/email', (_req, res) => {
  const u = process.env.GMAIL_USER?.trim() ?? '';
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
  res.json({
    gmailUserSet: u.length > 0,
    appPasswordLength: pass.length,
    expectedAppPasswordLength: 16,
    looksConfigured: u.length > 0 && pass.length === 16,
    hint:
      'If looksConfigured is false locally, quote GMAIL_APP_PASSWORD in .env. On Render, paste the 16-char app password in the dashboard.',
  });
});

/** Actually connects to Gmail (verify); shows Invalid login / network errors. No email sent. */
app.get('/health/email/smtp', async (_req, res) => {
  try {
    const r = await verifyGmailSmtpConnection();
    res.json({
      smtpVerifyOk: r.ok,
      error: r.error ?? null,
      note: r.ok
        ? 'SMTP auth OK — sending should work if inbox is not full / rate limits.'
        : 'Fix GMAIL_USER + GMAIL_APP_PASSWORD or Google security (App Password, 2FA).',
    });
  } catch (e) {
    res.status(500).json({
      smtpVerifyOk: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const keepAliveUrl = config.keepAlive.url || `http://127.0.0.1:${config.port}/health`;
setInterval(() => {
  void fetch(keepAliveUrl).catch((err) => {
    console.error('Keep-alive ping failed:', err);
  });
}, FIFTEEN_MINUTES_MS);

export default app;
