import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';

const start = async (): Promise<void> => {
  await connectDatabase();
  const port = Number(process.env.PORT) || config.port;
  const host = '0.0.0.0';

  app.listen(port, host, () => {
    console.log(`Server running on ${host}:${port} (${config.env})`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
