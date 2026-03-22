/**
 * Must be imported before any module reads process.env (especially GMAIL_*).
 * Render injects env vars at runtime — local dev uses server/.env
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
