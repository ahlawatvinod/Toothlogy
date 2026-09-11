/**
 * TL-API-CATALOGUE-TREATMENTS-001 — GET /api/v1/catalogue/treatments
 *
 * The treatment catalogue: every procedure a clinic can list, with plain-language
 * descriptions. Public — patients browse it, clinics pick from it. Reference
 * data from the database (seeded from src/platform/catalogue/treatments.ts),
 * so the list a clinic chooses from is exactly the list offerings validate
 * against.
 */

import { defineRoute } from '@/platform/http/handler';
import { db } from '@/platform/db/client';
import { TREATMENT_CATEGORY_LABELS } from '@/platform/catalogue/treatments';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CATALOGUE-TREATMENTS-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async () => {
    const treatments = await db().treatment.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }],
      select: {
        key: true,
        name: true,
        category: true,
        description: true,
        typicalDurationMinutes: true,
      },
    });
    return {
      categories: Object.entries(TREATMENT_CATEGORY_LABELS).map(([key, label]) => ({ key, label })),
      treatments,
    };
  },
});
