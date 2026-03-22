import './loadEnv';
import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import { isResendConfigured } from './services/verificationEmail';

const start = async (): Promise<void> => {
  await connectDatabase();
  const port = Number(process.env.PORT) || config.port;
  const host = '0.0.0.0';

  app.listen(port, host, () => {
    console.log(`Server running on ${host}:${port} (${config.env})`);
    if (isResendConfigured()) {
      console.log('[email] Resend configured — verification emails enabled.');
    } else {
      console.warn('[email] Verification emails disabled — set RESEND_API_KEY + RESEND_FROM');
    }
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
