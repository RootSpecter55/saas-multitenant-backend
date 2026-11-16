# PLAN — saas-multitenant-backend

A multi-tenant SaaS backend where each customer is an organisation. Users sign up, create organisations, invite teammates, pick a plan and record usage. Postgres row-level security (RLS) keeps every organisation's data separate.

**Stack:** Node 24, TypeScript 5.9 (strict), Express 5, Prisma 7 (with `@prisma/adapter-pg`), Zod 4, pino, Jest 30 with Supertest, ESLint and Prettier, PostgreSQL 16. Redis isn't used because nothing in the spec needs it.

## Modules

| Module        | Responsibility                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| auth          | Register, login and `me`. Token checks go through `AuthProvider`.                                                                             |
| organisations | Create, read, update and delete orgs. Creating one also makes the creator its owner and puts the org on the free plan.                        |
| memberships   | List members, change roles and remove members. Rules: the last owner can't be removed or demoted, and only an owner can grant the owner role. |
| invites       | Create, list and revoke invites, and accept by token. Tokens are stored hashed and expire after 7 days.                                       |
| plans         | Read-only list and detail. Plans are loaded by a seed script.                                                                                 |
| subscriptions | The current subscription, a checkout link from `PaymentProvider`, and the payment webhook.                                                    |
| usage         | Record usage events, list them, and show this month's total against the plan quota.                                                           |

**Shared code (`src/common/`):** config (Zod-validated env), logger, error classes and the global error handler, the `validate` middleware, the pagination helper, the auth middleware, a base repository for create/read/update/delete, the Prisma client, `withTenant()`, and response helpers.

**Providers (`src/providers/`):**

- `AuthProvider`: `LocalJwtAuthProvider` (default, using jsonwebtoken and scrypt password hashes) or `CognitoAuthProvider` (using `aws-jwt-verify`).
- `PaymentProvider`: `FakePaymentProvider` (default; signs webhooks with HMAC so signature checks really run in tests) or `StripePaymentProvider`.
- A factory chooses each provider from env (`AUTH_PROVIDER`, `PAYMENT_PROVIDER`).

**Module layout:** each module has `*.routes.ts → *.controller.ts → *.service.ts → *.repository.ts` plus `*.schemas.ts`.

## Data model

```
User                  id, email (unique), name, passwordHash?, externalId? (unique, Cognito sub), createdAt
Organisation   [RLS]  id, name, slug (unique), createdAt, updatedAt
Membership     [RLS]  id, orgId, userId, role (OWNER|ADMIN|MEMBER), createdAt     unique(orgId, userId)
Invite         [RLS]  id, orgId, email, role, tokenHash (unique), invitedById, expiresAt, acceptedAt?, createdAt
Plan                  id, code (unique: free|pro|business), name, priceCents, maxMembers, monthlyUsageQuota, providerPriceId?
Subscription   [RLS]  id, orgId (unique), planId, status (ACTIVE|PAST_DUE|CANCELED), providerCustomerId?, providerSubscriptionId?, currentPeriodEnd?
UsageRecord    [RLS]  id, orgId, metric, quantity, recordedAt                     index(orgId, metric, recordedAt)
ProcessedWebhookEvent id, provider, eventId, type, processedAt                     unique(provider, eventId)
```

## Tenant isolation (the main mechanism)

- A migration turns on `ROW LEVEL SECURITY` for the tables marked [RLS]. Each gets a policy: `org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid` (on `organisations` it's `id = …`).
- `dbContext.tenant(orgId, fn)` opens a Prisma transaction and runs `SET LOCAL ROLE app_tenant` and `set_config('app.current_org_id', orgId, true)`. Then it runs `fn`. Both settings end when the transaction does.
- **Why switch roles:** superusers and table owners skip RLS. Locally the app user is a superuser, and on RDS it would be the table owner. `app_tenant` is a NOLOGIN role created by a migration with no bypass rights, so the policies always apply to it. That works the same in every environment with a single `DATABASE_URL`.
- (Changed during the build: the tables don't use `FORCE ROW LEVEL SECURITY`. With FORCE, the owner-connected "system" reads below would return nothing on RDS but everything locally as superuser. Restricting through the role keeps both environments the same.)
- If no org is set, the policy compares against NULL, so queries return nothing. That fails safe.
- **Only cross-tenant read:** `GET /orgs` (which orgs am I in?) runs outside the tenant context, filtered by `userId`. The README documents this.
- **Tests that prove it:** inside org A's context, reads of org B's memberships, invites, usage and subscription return nothing, and inserting a row with org B's id is rejected by the policy's `WITH CHECK`.

## Webhook idempotency

`POST /webhooks/payments` reads the raw body and has the provider check the signature and turn it into a standard event: `subscription.activated` or `subscription.canceled`, with `orgId` taken from checkout metadata. In one tenant transaction it:

1. Inserts `ProcessedWebhookEvent(provider, eventId)`.
2. Updates the subscription.

If the event was already processed, the unique constraint rejects the insert (Prisma `P2002`). The transaction rolls back and the endpoint returns `200 {"data":{"status":"duplicate"}}`.

## Plan limits

`enforcePlanLimit('members' | 'monthlyUsage')` middleware runs after the membership check:

- `members`: current members plus pending invites must be under `plan.maxMembers`. Used on invite create. A pending invite reserves a seat, so accepting it needs no second check.
- `monthlyUsage`: this month's total plus the requested quantity must not exceed `plan.monthlyUsageQuota`. Used on `POST /usage`.
- Over the limit returns `403 PLAN_LIMIT_EXCEEDED`.

## Endpoints

All responses use one envelope: `{ data, meta? }` on success and `{ error: { code, message, details? } }` on errors. Every list takes `?page=&pageSize=` and returns `meta: {page, pageSize, total, totalPages}`. Role rules are shown as `[member+]`, `[admin+]` or `[owner]`.

```
GET    /health
POST   /auth/register                 (local provider only)
POST   /auth/login                    (local provider only)
GET    /auth/me
POST   /orgs
GET    /orgs                          my orgs, paginated
GET    /orgs/:orgId                   [member+]
PATCH  /orgs/:orgId                   [admin+]
DELETE /orgs/:orgId                   [owner]
GET    /orgs/:orgId/members           [member+]
PATCH  /orgs/:orgId/members/:memberId [admin+]
DELETE /orgs/:orgId/members/:memberId [admin+ or self]
POST   /orgs/:orgId/invites           [admin+, members limit]  returns the token once
GET    /orgs/:orgId/invites           [admin+]
DELETE /orgs/:orgId/invites/:inviteId [admin+]
POST   /orgs/:orgId/invites/accept    [authenticated, email must match]
GET    /plans
GET    /plans/:planId
GET    /orgs/:orgId/subscription           [member+]
POST   /orgs/:orgId/subscription/checkout  [owner]  returns a checkout URL
POST   /webhooks/payments                  (signature verified, no auth)
POST   /orgs/:orgId/usage             [member+, monthlyUsage limit]
GET    /orgs/:orgId/usage             [member+]
GET    /orgs/:orgId/usage/summary     [member+]  this month's total vs quota
```

## Tests

- **Unit:** each service with mocked repositories and providers, and `start-with-secrets` with a mocked Secrets Manager client.
- **Integration:** Supertest against a real Postgres (docker compose locally, a service container in CI). Covers the main endpoints, the RLS isolation test, webhook idempotency and plan limits.

## Deployment files (config only, nothing deployed)

`Dockerfile` (multi-stage, non-root, healthcheck), `scripts/start-with-secrets.ts`, `deploy/ecs-task-definition.json` (placeholders only), `.github/workflows/deploy.yml` (`workflow_dispatch` only, OIDC), `.github/workflows/ci.yml` (lint + tests), `.env.example`.

## Build order (one commit or more per step)

1. Scaffold: tsconfig, lint, jest, docker-compose, `.env.example`, CI
2. Common layer and the `/health` endpoint
3. Prisma schema, migrations (including RLS and `app_tenant`), seed
4. auth and AuthProvider
5. organisations and memberships, plus the RLS isolation test
6. invites
7. plans, subscriptions, PaymentProvider and the webhook
8. usage and plan-limit middleware
9. Deployment files and `start-with-secrets`
10. README
