import './loadEnv';
import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';

const start = async (): Promise<void> => {
  await connectDatabase();
  const port = Number(process.env.PORT) || config.port;
  const host = '0.0.0.0';

  app.listen(port, host, () => {
    console.log(`Server running on ${host}:${port} (${config.env})`);
    const gu = process.env.GMAIL_USER?.trim();
    const gp = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
    if (gu && gp) {
      const len = gp.length;
      console.log(
        `[email] Gmail env present (app password length=${len}, expected 16). GET /health/email to verify on Render.`
      );
      if (len !== 16) {
        console.warn('[email] App password length is not 16 — check .env quoting, e.g. GMAIL_APP_PASSWORD="...."');
      }
    } else {
      console.warn('[email] Verification mail disabled — add GMAIL_USER + GMAIL_APP_PASSWORD (Google App Password)');
    }
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
