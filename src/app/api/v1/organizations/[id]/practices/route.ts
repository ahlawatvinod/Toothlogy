/**
 * TL-API-ORG-PRACTICELIST-001    — GET  /api/v1/organizations/:id/practices
 * TL-API-ORG-PRACTICECONFIRM-001 — POST /api/v1/organizations/:id/practices
 *
 * The clinic side of the practice relationship: which dentists claim to work
 * here, and confirming them.
 *
 * Confirmation is the check that stops a dentist from appearing in a clinic's
 * search results without that clinic's agreement. It requires
 * `tl.clinic.practice.confirm`, scoped to this organization, so one clinic
 * cannot confirm a practice at another clinic's location.
 */

import { z } from 'zod';
import { confirmPractice } from '@/platform/dentists/service';
import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

export const GET = defineRoute({
  id: 'TL-API-ORG-PRACTICELIST-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ params }) => {
    const organizationId = typeof params.id === 'string' ? params.id : null;
    if (!organizationId) throw errors.validation('Organization id is required.');

    const practices = await db().dentistPractice.findMany({
      where: { location: { organizationId, deletedAt: null } },
      include: {
        location: { select: { id: true, name: true } },
        dentistProfile: {
          select: {
            id: true,
            slug: true,
            isVerified: true,
            user: { select: { displayName: true } },
          },
        },
      },
      orderBy: [{ isConfirmed: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      practices: practices.map((p) => ({
        id: p.id,
        isConfirmed: p.isConfirmed,
        location: { id: p.location.id, name: p.location.name },
        dentist: {
          slug: p.dentistProfile.slug,
          displayName: p.dentistProfile.user.displayName,
          // Surfaced so a clinic can see whether the dentist they are
          // confirming has actually had their credentials checked.
          isVerified: p.dentistProfile.isVerified,
        },
      })),
    };
  },
});

const confirmSchema = z.object({
  practiceId: z.string().min(1),
});

export const POST = defineRoute({
  id: 'TL-API-ORG-PRACTICECONFIRM-001',
  permissions: ['tl.clinic.practice.confirm'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: confirmSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const organizationId = typeof params.id === 'string' ? params.id : null;
    if (!organizationId) throw errors.validation('Organization id is required.');

    await confirmPractice(body.practiceId, organizationId, principal.userId);

    return {
      confirmed: true,
      message:
        'Confirmed. If the dentist is also verified, they now appear in patient search for this location.',
    };
  },
});
