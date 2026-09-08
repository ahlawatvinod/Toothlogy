/**
 * TL-TEST-ORG-INTEGRATION-001 — Organizations against a real database
 *
 * The most important tests in this file are the CROSS-TENANT ones. Leaking data
 * between organizations is the most likely serious authorization bug in a
 * multi-tenant product, and it is silent: nothing errors, the wrong clinic's
 * data simply appears. These assert that a member of one organization holds no
 * permission over another.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { resolveSession, createSession } from '@/platform/auth/session';
import {
  acceptInvitation,
  changeMemberRole,
  createOrganization,
  inviteToOrganization,
  listInvitations,
  listUserOrganizations,
  removeMember,
  revokeInvitation,
} from '@/platform/organizations/service';
import { createLocation, isOpenAt, setBusinessHours } from '@/platform/organizations/locations';
import { can, isAuthenticated } from '@/platform/rbac';
import {
  assertSeeded,
  describeIntegration,
  disconnectTestDb,
  resetDatabase,
  testDb,
  useDatabaseAuditSink,
} from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';

async function makeUser(email: string, displayName = 'Test User') {
  const result = await register({
    email,
    password: PASSWORD,
    displayName,
    role: 'dentist',
    acceptedTerms: true,
  });
  return result.userId;
}

function clinic(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Smile Dental Care',
    slug: 'smile-dental-care',
    type: 'CLINIC' as const,
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    ...overrides,
  };
}

describeIntegration('organizations (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------

  it('creates the organization, membership and role assignment atomically', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const organization = await testDb().organization.findUnique({
      where: { id: organizationId },
      include: { members: true, roleAssignments: true },
    });

    // An organization with no members is unreachable: nobody can invite anyone
    // into it, so it is only fixable by a database edit.
    expect(organization!.members).toHaveLength(1);
    expect(organization!.roleAssignments).toHaveLength(1);
    expect(organization!.members[0]!.roleKey).toBe('clinic_admin');
    // Not publicly discoverable until verified (Constitution P2).
    expect(organization!.status).toBe('PENDING');
  });

  it('rejects a duplicate slug', async () => {
    const a = await makeUser('a@example.test');
    const b = await makeUser('b@example.test');

    await createOrganization(clinic(), a);
    await expect(createOrganization(clinic(), b)).rejects.toThrow(/already taken/i);

    expect(await testDb().organization.count()).toBe(1);
  });

  it('rejects reserved and malformed slugs', async () => {
    const ownerId = await makeUser('owner@example.test');

    // A slug like `admin` would shadow a platform route.
    await expect(createOrganization(clinic({ slug: 'admin' }), ownerId)).rejects.toThrow();
    await expect(createOrganization(clinic({ slug: 'Has Spaces' }), ownerId)).rejects.toThrow();
    await expect(createOrganization(clinic({ slug: 'ab' }), ownerId)).rejects.toThrow();
  });

  it('rejects an unsupported country', async () => {
    const ownerId = await makeUser('owner@example.test');
    await expect(
      createOrganization(clinic({ countryCode: 'ZZ' }), ownerId),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // Cross-tenant authorization — the critical property
  // -------------------------------------------------------------------------

  it('grants organization permissions only within the caller’s own organization', async () => {
    const ownerA = await makeUser('a@example.test');
    const ownerB = await makeUser('b@example.test');

    const orgA = await createOrganization(clinic({ slug: 'clinic-a' }), ownerA);
    const orgB = await createOrganization(clinic({ slug: 'clinic-b' }), ownerB);

    const session = await createSession(ownerA);
    const principal = await resolveSession(session.token);
    expect(isAuthenticated(principal)).toBe(true);

    // The check that stops one clinic's administrator from managing another.
    expect(can(principal, 'tl.core.organization.manage', { organizationId: orgA.organizationId })).toBe(true);
    expect(can(principal, 'tl.core.organization.manage', { organizationId: orgB.organizationId })).toBe(false);
    expect(can(principal, 'tl.core.organization.read', { organizationId: orgB.organizationId })).toBe(false);
  });

  it('denies an organization permission when no organization is named', async () => {
    // An unanswerable authorization question must be a denial, not a pass.
    const ownerA = await makeUser('a@example.test');
    await createOrganization(clinic({ slug: 'clinic-a' }), ownerA);

    const session = await createSession(ownerA);
    const principal = await resolveSession(session.token);

    expect(can(principal, 'tl.core.organization.manage')).toBe(false);
  });

  it('does not leak organization roles into the global permission set', async () => {
    const ownerA = await makeUser('a@example.test');
    const orgA = await createOrganization(clinic({ slug: 'clinic-a' }), ownerA);

    const session = await createSession(ownerA);
    const principal = await resolveSession(session.token);
    if (!isAuthenticated(principal)) throw new Error('expected authenticated');

    // The org role is scoped to the membership, not held globally.
    expect(principal.roles).not.toContain('clinic_admin');
    expect(principal.organizations).toHaveLength(1);
    expect(principal.organizations[0]!.organizationId).toBe(orgA.organizationId);
  });

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------

  it('invites, accepts, and grants the invited role', async () => {
    const ownerId = await makeUser('owner@example.test');
    const inviteeId = await makeUser('invitee@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );

    const accepted = await acceptInvitation(invitation.token, inviteeId);
    expect(accepted.roleKey).toBe('clinic_staff');

    const session = await createSession(inviteeId);
    const principal = await resolveSession(session.token);

    expect(can(principal, 'tl.core.organization.read', { organizationId })).toBe(true);
    // Staff can read but not manage.
    expect(can(principal, 'tl.core.organization.manage', { organizationId })).toBe(false);
  });

  it('refuses an invitation redeemed by a different email', async () => {
    // Without this, anyone holding a forwarded token could join.
    const ownerId = await makeUser('owner@example.test');
    const strangerId = await makeUser('stranger@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'intended@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );

    await expect(acceptInvitation(invitation.token, strangerId)).rejects.toThrow(/permission/i);
    expect(await testDb().organizationMember.count({ where: { organizationId } })).toBe(1);
  });

  it('consumes an invitation exactly once', async () => {
    const ownerId = await makeUser('owner@example.test');
    const inviteeId = await makeUser('invitee@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );

    await acceptInvitation(invitation.token, inviteeId);
    await expect(acceptInvitation(invitation.token, inviteeId)).rejects.toThrow(
      /no longer valid/i,
    );
  });

  it('revokes the previous invitation when re-inviting the same address', async () => {
    // Otherwise every invitation ever sent stays redeemable until it expires.
    const ownerId = await makeUser('owner@example.test');
    const inviteeId = await makeUser('invitee@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const first = await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );
    await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'dentist' },
      ownerId,
    );

    await expect(acceptInvitation(first.token, inviteeId)).rejects.toThrow(/no longer valid/i);
    expect(await listInvitations(organizationId)).toHaveLength(1);
  });

  it('rejects an expired invitation', async () => {
    const ownerId = await makeUser('owner@example.test');
    const inviteeId = await makeUser('invitee@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );

    await testDb().invitation.update({
      where: { id: invitation.invitationId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(acceptInvitation(invitation.token, inviteeId)).rejects.toThrow(/expired/i);
  });

  it('refuses to invite an existing member', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    await expect(
      inviteToOrganization(
        organizationId,
        { email: 'owner@example.test', roleKey: 'clinic_staff' },
        ownerId,
      ),
    ).rejects.toThrow(/already a member/i);
  });

  it('never exposes the invitation token hash when listing', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);
    await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );

    const invitations = await listInvitations(organizationId);
    expect(invitations[0]).not.toHaveProperty('tokenHash');
  });

  it('revokes a pending invitation', async () => {
    const ownerId = await makeUser('owner@example.test');
    const inviteeId = await makeUser('invitee@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );

    await revokeInvitation(invitation.invitationId, organizationId, ownerId);
    await expect(acceptInvitation(invitation.token, inviteeId)).rejects.toThrow();
  });

  it('does not revoke an invitation belonging to another organization', async () => {
    // Scoped by organizationId as well as id, so a cross-tenant revoke fails.
    const ownerA = await makeUser('a@example.test');
    const ownerB = await makeUser('b@example.test');
    const orgA = await createOrganization(clinic({ slug: 'clinic-a' }), ownerA);
    const orgB = await createOrganization(clinic({ slug: 'clinic-b' }), ownerB);

    const invitation = await inviteToOrganization(
      orgA.organizationId,
      { email: 'invitee@example.test', roleKey: 'clinic_staff' },
      ownerA,
    );

    await expect(
      revokeInvitation(invitation.invitationId, orgB.organizationId, ownerB),
    ).rejects.toThrow(/not found/i);
  });

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  it('refuses to remove the last administrator', async () => {
    // An organization with no admin cannot invite, configure or recover itself.
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    await expect(removeMember(organizationId, ownerId, ownerId)).rejects.toThrow(
      /only administrator/i,
    );
  });

  it('refuses to demote the last administrator', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    await expect(
      changeMemberRole(organizationId, ownerId, 'clinic_staff', ownerId),
    ).rejects.toThrow(/only administrator/i);
  });

  it('removes a member and revokes their permissions immediately', async () => {
    const ownerId = await makeUser('owner@example.test');
    const staffId = await makeUser('staff@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'staff@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );
    await acceptInvitation(invitation.token, staffId);

    await removeMember(organizationId, staffId, ownerId);

    // A stale role assignment would keep granting access to someone who left.
    const session = await createSession(staffId);
    const principal = await resolveSession(session.token);
    expect(can(principal, 'tl.core.organization.read', { organizationId })).toBe(false);
    expect(await listUserOrganizations(staffId)).toHaveLength(0);
  });

  it('changes a member role and updates their permissions', async () => {
    const ownerId = await makeUser('owner@example.test');
    const staffId = await makeUser('staff@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const invitation = await inviteToOrganization(
      organizationId,
      { email: 'staff@example.test', roleKey: 'clinic_staff' },
      ownerId,
    );
    await acceptInvitation(invitation.token, staffId);

    await changeMemberRole(organizationId, staffId, 'clinic_admin', ownerId);

    const session = await createSession(staffId);
    const principal = await resolveSession(session.token);
    expect(can(principal, 'tl.core.organization.manage', { organizationId })).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Locations and hours
  // -------------------------------------------------------------------------

  it('creates a branch with its address and hours in one transaction', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const result = await createLocation(
      organizationId,
      {
        name: 'Raipur Branch',
        slug: 'raipur',
        timezone: 'Asia/Kolkata',
        isPrimary: true,
        latitude: 21.2514,
        longitude: 81.6296,
        address: {
          lines: ['12 Civil Lines'],
          locality: 'Raipur',
          postalCode: '492001',
          countryCode: 'IN',
        },
        hours: [
          { dayOfWeek: 1, opensAtMinutes: 540, closesAtMinutes: 780 },
          { dayOfWeek: 1, opensAtMinutes: 1020, closesAtMinutes: 1260 },
        ],
      },
      ownerId,
    );

    expect(result.discoverable).toBe(true);

    const location = await testDb().location.findUnique({
      where: { id: result.locationId },
      include: { address: true, businessHours: true },
    });

    expect(location!.address).not.toBeNull();
    // Split shifts: 09:00–13:00 and 17:00–21:00, the norm for Indian clinics.
    expect(location!.businessHours).toHaveLength(2);
  });

  it('reports a branch without coordinates as not discoverable', async () => {
    // Surfaced rather than hidden: this is why a clinic gets no patients.
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const result = await createLocation(
      organizationId,
      { name: 'No Coords', slug: 'no-coords', timezone: 'Asia/Kolkata', isPrimary: false },
      ownerId,
    );

    expect(result.discoverable).toBe(false);
  });

  it('rejects overlapping shifts on the same day', async () => {
    // Overlaps make "is this clinic open?" ambiguous and would later produce
    // conflicting appointment slots.
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    await expect(
      createLocation(
        organizationId,
        {
          name: 'Bad Hours',
          slug: 'bad-hours',
          timezone: 'Asia/Kolkata',
          isPrimary: false,
          hours: [
            { dayOfWeek: 1, opensAtMinutes: 540, closesAtMinutes: 780 },
            { dayOfWeek: 1, opensAtMinutes: 700, closesAtMinutes: 900 },
          ],
        },
        ownerId,
      ),
    ).rejects.toThrow(/overlap/i);
  });

  it('keeps only one primary branch', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    await createLocation(
      organizationId,
      { name: 'First', slug: 'first', timezone: 'Asia/Kolkata', isPrimary: true },
      ownerId,
    );
    await createLocation(
      organizationId,
      { name: 'Second', slug: 'second', timezone: 'Asia/Kolkata', isPrimary: true },
      ownerId,
    );

    const primaries = await testDb().location.findMany({
      where: { organizationId, isPrimary: true },
    });
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.name).toBe('Second');
  });

  it('replaces hours wholesale rather than leaving stale rows', async () => {
    const ownerId = await makeUser('owner@example.test');
    const { organizationId } = await createOrganization(clinic(), ownerId);

    const location = await createLocation(
      organizationId,
      {
        name: 'Branch',
        slug: 'branch',
        timezone: 'Asia/Kolkata',
        isPrimary: false,
        hours: [{ dayOfWeek: 1, opensAtMinutes: 540, closesAtMinutes: 1080 }],
      },
      ownerId,
    );

    await setBusinessHours(
      location.locationId,
      [{ dayOfWeek: 2, opensAtMinutes: 600, closesAtMinutes: 900 }],
      ownerId,
    );

    // A stale row would show the clinic open when it is closed.
    const hours = await testDb().businessHours.findMany({
      where: { locationId: location.locationId },
    });
    expect(hours).toHaveLength(1);
    expect(hours[0]!.dayOfWeek).toBe(2);
  });

  it('answers open/closed in the location’s own timezone', async () => {
    // A patient in London checking a Raipur clinic wants Raipur's hours.
    const hours = [{ dayOfWeek: 1, opensAtMinutes: 540, closesAtMinutes: 1080 }];

    // Monday 2026-06-15, 06:00 UTC = 11:30 IST — open.
    expect(isOpenAt(hours, new Date('2026-06-15T06:00:00Z'), 'Asia/Kolkata')).toBe(true);
    // Monday 2026-06-15, 20:00 UTC = 01:30 IST Tuesday — closed.
    expect(isOpenAt(hours, new Date('2026-06-15T20:00:00Z'), 'Asia/Kolkata')).toBe(false);
    // Sunday — closed.
    expect(isOpenAt(hours, new Date('2026-06-14T06:00:00Z'), 'Asia/Kolkata')).toBe(false);
  });
});
