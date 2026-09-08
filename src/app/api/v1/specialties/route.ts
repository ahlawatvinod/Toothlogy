/**
 * TL-API-SPECIALTIES-001 — GET /api/v1/specialties
 *
 * The dental specialty reference list. Public: it powers the profile editor and
 * will power discovery filters, and there is nothing private about the list of
 * dental specialties that exist.
 *
 * Descriptions are patient-facing rather than clinical. A filter labelled only
 * "Endodontics" is one most patients skip, and skipping it sends them to a
 * general practitioner for a problem that needs a specialist.
 */

import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-SPECIALTIES-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async () => {
    const specialties = await db().specialty.findMany({ orderBy: { name: 'asc' } });

    return {
      specialties: specialties.map((s) => ({
        key: s.key,
        name: s.name,
        description: s.description,
      })),
    };
  },
});
