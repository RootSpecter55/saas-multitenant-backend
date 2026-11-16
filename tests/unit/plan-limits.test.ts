import { PlanLimitError } from '../../src/common/errors';
import type { InviteRepository } from '../../src/modules/invites/invites.repository';
import type { MembershipRepository } from '../../src/modules/memberships/memberships.repository';
import { PlanLimitService } from '../../src/modules/subscriptions/plan-limits';
import type { SubscriptionRepository } from '../../src/modules/subscriptions/subscriptions.repository';
import type { UsageRepository } from '../../src/modules/usage/usage.repository';
import { currentBillingPeriod } from '../../src/modules/usage/usage.service';
import { fakeDbContext, mockOf } from './fakes';

describe('currentBillingPeriod', () => {
  it('spans the calendar month in UTC', () => {
    const { start, end } = currentBillingPeriod(new Date('2026-02-14T23:30:00Z'));
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('PlanLimitService', () => {
  let subscriptions: jest.Mocked<SubscriptionRepository>;
  let memberships: jest.Mocked<MembershipRepository>;
  let invites: jest.Mocked<InviteRepository>;
  let usage: jest.Mocked<UsageRepository>;
  let service: PlanLimitService;

  beforeEach(() => {
    subscriptions = mockOf<SubscriptionRepository>('findByOrg');
    memberships = mockOf<MembershipRepository>('countAll');
    invites = mockOf<InviteRepository>('countPending');
    usage = mockOf<UsageRepository>('sumBetween');
    service = new PlanLimitService(fakeDbContext(), subscriptions, memberships, invites, usage);
    subscriptions.findByOrg.mockResolvedValue({
      plan: { maxMembers: 3, monthlyUsageQuota: 100 },
    } as never);
  });

  it('counts members plus pending invites against maxMembers', async () => {
    memberships.countAll.mockResolvedValue(2);
    invites.countPending.mockResolvedValue(0);
    await expect(service.check('org-1', 'members', 1)).resolves.toBeUndefined();

    invites.countPending.mockResolvedValue(1);
    await expect(service.check('org-1', 'members', 1)).rejects.toEqual(
      new PlanLimitError('members', { used: 3, max: 3 }),
    );
  });

  it('allows usage up to exactly the quota and rejects beyond it', async () => {
    usage.sumBetween.mockResolvedValue(90);
    await expect(service.check('org-1', 'monthlyUsage', 10)).resolves.toBeUndefined();
    await expect(service.check('org-1', 'monthlyUsage', 11)).rejects.toBeInstanceOf(PlanLimitError);
  });
});
