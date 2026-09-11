/**
 * TL-API-ORG-SERVICE-LIST-001   — GET   /api/v1/organizations/:id/services
 * TL-API-ORG-SERVICE-CREATE-001 — POST  /api/v1/organizations/:id/services
 * TL-API-ORG-SERVICE-UPDATE-001 — PATCH /api/v1/organizations/:id/services?offeringId=…
 *
 * The treatments a clinic offers, at its prices. Offerings are never deleted —
 * an appointment booked last year still points at the price it was booked at —
 * so "remove" is `isActive: false`.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import {
  createOffering,
  listOrganizationOfferings,
  offeringInputSchema,
  offeringUpdateSchema,
  updateOffering,
} from '@/platform/organizations/offerings';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

function organizationId(params: Record<string, string | string[] | undefined>): string {
  if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
  return params.id;
}

export const GET = defineRoute({
  id: 'TL-API-ORG-SERVICE-LIST-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ params }) => {
    const offerings = await listOrganizationOfferings(organizationId(params));
    return {
      services: offerings.map((o) => ({
        id: o.id,
        name: o.name,
        treatment: o.treatment,
        location: o.location,
        dentist: o.dentistProfile
          ? { id: o.dentistProfile.id, slug: o.dentistProfile.slug, name: o.dentistProfile.user.displayName }
          : null,
        priceMinor: o.priceMinor,
        priceMaxMinor: o.priceMaxMinor,
        currency: o.currency,
        durationMinutes: o.durationMinutes,
        appointmentTypes: o.appointmentTypes,
        requiresConsultation: o.requiresConsultation,
        isActive: o.isActive,
      })),
    };
  },
});

export const POST = defineRoute({
  id: 'TL-API-ORG-SERVICE-CREATE-001',
  permissions: ['tl.clinic.service.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: offeringInputSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return createOffering(organizationId(params), body, principal.userId, { requestId });
  },
});

export const PATCH = defineRoute({
  id: 'TL-API-ORG-SERVICE-UPDATE-001',
  permissions: ['tl.clinic.service.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: offeringUpdateSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, url, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const offeringId = url.searchParams.get('offeringId');
    if (!offeringId) throw errors.validation('Say which service to change.', { field: 'offeringId' });
    await updateOffering(organizationId(params), offeringId, body, principal.userId, { requestId });
    return { updated: true };
  },
});
