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

const emailStatusHandler = (_req: express.Request, res: express.Response): void => {
  const u = process.env.GMAIL_USER?.trim() ?? '';
  const pass = (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '');
  const apiPublic = (process.env.API_PUBLIC_URL ?? '').trim();
  res.json({
    gmailUserSet: u.length > 0,
    appPasswordLength: pass.length,
    expectedAppPasswordLength: 16,
    gmailLooksConfigured: u.length > 0 && pass.length === 16,
    apiPublicUrlSet: apiPublic.length > 0,
  });
};

const smtpVerifyHandler = async (_req: express.Request, res: express.Response): Promise<void> => {
  try {
    const r = await verifyGmailSmtpConnection();
    const err = r.error ?? '';
    const looksLikeTimeout = /timeout|etimedout|ETIMEDOUT/i.test(err);
    res.json({
      smtpVerifyOk: r.ok,
      error: r.error ?? null,
      note: r.ok
        ? 'SMTP authentication succeeded.'
        : looksLikeTimeout
          ? 'Connection timeout — your host may block outbound SMTP (465/587), or the network is unreachable.'
          : 'Check GMAIL_USER, GMAIL_APP_PASSWORD (16-char Google App Password), and that 2-Step Verification is on.',
    });
  } catch (e) {
    res.status(500).json({
      smtpVerifyOk: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

const healthRootHandler = (_req: express.Request, res: express.Response): void => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
};

app.get('/health', healthRootHandler);
app.get('/api/health', healthRootHandler);

app.get('/health/email', emailStatusHandler);
app.get('/api/health/email', emailStatusHandler);

app.get('/health/email/smtp', smtpVerifyHandler);
app.get('/api/health/email/smtp', smtpVerifyHandler);

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
