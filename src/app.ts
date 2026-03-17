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
