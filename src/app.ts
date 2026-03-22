import './loadEnv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { getResendHealth } from './services/verificationEmail';
import routes from './routes';
import { errorHandler, notFound } from './middleware';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const emailStatusHandler = (_req: express.Request, res: express.Response): void => {
  const apiPublic = (process.env.API_PUBLIC_URL ?? '').trim();
  const h = getResendHealth();
  const sandbox =
    h.fromEmail === 'onboarding@resend.dev'
      ? 'With onboarding@resend.dev, Resend only delivers to your Resend login email until you verify a domain (resend.com/domains).'
      : undefined;
  res.json({
    resendApiKeySet: h.resendApiKeySet,
    resendFromSet: h.resendFromSet,
    fromEmail: h.fromEmail,
    fromProblem: h.fromProblem,
    apiPublicUrlSet: apiPublic.length > 0,
    resendReady: h.resendReady,
    resendSandboxNote: sandbox,
    note: h.resendReady
      ? sandbox ?? 'Verification email is sent via Resend.'
      : h.fromProblem ?? 'Fix Resend configuration.',
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
