import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Plan catalogue. Prices and limits are example values for a demo, not real pricing.
// providerPriceId stays null: set it to a Stripe Price ID when using PAYMENT_PROVIDER=stripe.
const plans = [
  { code: 'free', name: 'Free', priceCents: 0, maxMembers: 3, monthlyUsageQuota: 1_000 },
  { code: 'pro', name: 'Pro', priceCents: 2_900, maxMembers: 10, monthlyUsageQuota: 50_000 },
  {
    code: 'business',
    name: 'Business',
    priceCents: 9_900,
    maxMembers: 50,
    monthlyUsageQuota: 500_000,
  },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  for (const plan of plans) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: plan, create: plan });
  }
  await prisma.$disconnect();
  console.log(`Seeded ${plans.length} plans`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
