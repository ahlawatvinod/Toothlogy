/**
 * TL-API-FACULTY-REQUEST-001 — POST /api/v1/me/academic/appointments { organizationId, designation, department? }
 *
 * Ask a college to confirm one's faculty post. The college's administrators
 * are told; nothing shows as confirmed until they confirm.
 */

import { appointmentRequestSchema, requestFacultyAppointment } from '@/platform/academic/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-FACULTY-REQUEST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: appointmentRequestSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => requestFacultyAppointment(principal, body, { requestId }),
});
