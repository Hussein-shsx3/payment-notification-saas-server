import './loadEnv';
import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import { getResendHealth } from './services/verificationEmail';

const start = async (): Promise<void> => {
  await connectDatabase();
  const port = Number(process.env.PORT) || config.port;
  const host = '0.0.0.0';

  app.listen(port, host, () => {
    console.log(`Server running on ${host}:${port} (${config.env})`);
    const h = getResendHealth();
    if (h.resendReady) {
      console.log('[email] Resend OK — verification emails enabled (from', h.fromEmail + ')');
    } else {
      console.warn('[email] Verification emails will fail:', h.fromProblem ?? 'incomplete env');
    }
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
