/**
 * Dev helper: sends a signed fake-provider webhook to a running API, standing in for a payment.
 *
 *   npm run webhook:fake -- <orgId> <planCode>   # e.g. pro: activate a paid plan
 *   npm run webhook:fake -- <orgId> cancel       # cancel back to free
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { signFakeWebhook } from '../src/providers/payment/fake.provider';

async function main() {
  const [orgId, action] = process.argv.slice(2);
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!orgId || !action || !secret) {
    console.error('Usage: npm run webhook:fake -- <orgId> <planCode|cancel>');
    console.error('PAYMENT_WEBHOOK_SECRET must be set (see .env.example).');
    process.exit(1);
  }

  const id = `evt_${randomUUID()}`;
  const event =
    action === 'cancel'
      ? { id, type: 'subscription.canceled', data: { orgId } }
      : { id, type: 'subscription.activated', data: { orgId, planCode: action } };
  const body = JSON.stringify(event);

  const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const res = await fetch(`${apiUrl}/webhooks/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-fake-signature': signFakeWebhook(body, secret),
    },
    body,
  });
  console.log(res.status, await res.text());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
