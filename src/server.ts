import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';

const start = async (): Promise<void> => {
  await connectDatabase();
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} (${config.env})`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
