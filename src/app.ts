import './loadEnv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { getBrevoEmailHealth } from './services/verificationEmail';
import routes from './routes';
import { errorHandler, notFound } from './middleware';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const emailStatusHandler = (_req: express.Request, res: express.Response): void => {
  const apiPublic = (process.env.API_PUBLIC_URL ?? '').trim();
  const feRaw = (process.env.FRONTEND_URL ?? '').trim();
  let feHint: string | undefined;
  if (feRaw && /\/app\/?$/i.test(feRaw)) {
    feHint =
      'FRONTEND_URL should be the site origin only (no /app). Example: https://your-app.vercel.app — code strips /app if present.';
  }
  const h = getBrevoEmailHealth();
  res.json({
    brevoApiKeySet: h.brevoApiKeySet,
    senderConfigured: h.senderConfigured,
    senderEmail: h.senderEmail,
    problem: h.problem,
    apiPublicUrlSet: apiPublic.length > 0,
    frontendUrlSet: feRaw.length > 0,
    frontendUrlHint: feHint,
    brevoReady: h.ready,
    note: h.ready
      ? 'Verification email is sent via Brevo.'
      : h.problem ?? 'Fix Brevo configuration.',
  });
};

const healthRootHandler = (_req: express.Request, res: express.Response): void => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
};

app.get('/health', healthRootHandler);
app.get('/api/health', healthRootHandler);

app.get('/health/email', emailStatusHandler);
app.get('/api/health/email', emailStatusHandler);

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
