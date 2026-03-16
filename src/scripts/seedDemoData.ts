import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database';
import { User, SubscriptionPayment } from '../models';

const SALT_ROUNDS = 10;

async function main() {
  try {
    await connectDatabase();

    console.log('Seeding demo users and payments...');

    const demoUsers = [
      {
        fullName: 'Demo User One',
        email: 'demo1@example.com',
        phoneNumber: '+970590000001',
      },
      {
        fullName: 'Demo User Two',
        email: 'demo2@example.com',
        phoneNumber: '+970590000002',
      },
      {
        fullName: 'Demo User Three',
        email: 'demo3@example.com',
        phoneNumber: '+970590000003',
      },
    ];

    const passwordHash = await bcrypt.hash('Password123!', SALT_ROUNDS);

    for (const demo of demoUsers) {
      const existing = await User.findOne({ email: demo.email });
      if (existing) {
        console.log(`User already exists, skipping: ${demo.email}`);
        continue;
      }

      const start = new Date();
      const end = new Date();
      end.setMonth(end.getMonth() + 1);

      const user = await User.create({
        fullName: demo.fullName,
        email: demo.email,
        phoneNumber: demo.phoneNumber,
        passwordHash,
        emailVerified: true,
        subscriptionStart: start,
        subscriptionEnd: end,
        currentSubscriptionPrice: 10,
        currentSubscriptionCurrency: 'USD',
        targetEmail: demo.email,
      });

      await SubscriptionPayment.create({
        userId: user._id,
        amount: 10,
        currency: 'USD',
        periodStart: start,
        periodEnd: end,
      });

      console.log(`Created demo user: ${demo.email}`);
    }

    console.log('Demo data seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed demo data:', err);
    process.exit(1);
  }
}

main();

