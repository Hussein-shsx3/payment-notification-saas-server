import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import routes from './routes';
import { config } from './config';
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
  });
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
