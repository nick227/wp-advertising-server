import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { seedSoftLaunchInventory, softLaunchSeedAllowed } from '../src/services/softLaunchSeed.js';

async function main() {
  if (!softLaunchSeedAllowed()) {
    console.error('Refusing to seed: set ALLOW_SOFT_LAUNCH_SEED=1 (local or Railway staging).');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const result = await seedSoftLaunchInventory();
  console.log(JSON.stringify(result, null, 2));
  console.log('Soft-launch inventory seeded. Rebuild rotation cache on the running service if needed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
