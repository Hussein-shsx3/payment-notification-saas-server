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
    const rk = !!process.env.RESEND_API_KEY?.trim();
    const mf = !!process.env.MAIL_FROM?.trim();
    if (rk && mf) {
      console.log('[email] Resend configured (RESEND_API_KEY + MAIL_FROM) — recommended on Render (HTTPS).');
    }
    const gu = process.env.GMAIL_USER?.trim();
    const gp = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
    if (gu && gp) {
      const len = gp.length;
      console.log(
        `[email] Gmail SMTP env present (app password length=${len}, expected 16). Often blocked on Render — use Resend if mail fails.`
      );
      if (len !== 16) {
        console.warn('[email] App password length is not 16 — check .env quoting, e.g. GMAIL_APP_PASSWORD="...."');
      }
    } else if (!rk) {
      console.warn('[email] No Resend — add RESEND_API_KEY + MAIL_FROM for production email on Render.');
    }
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
