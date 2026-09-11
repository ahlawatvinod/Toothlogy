/**
 * TL-API-APPT-BOOK-001 — POST /api/v1/appointments
 * TL-API-APPT-LIST-001 — GET  /api/v1/appointments
 *
 * Booking. The Idempotency-Key header is also the booking key stored on the
 * appointment, so a retried request — even one that outlives the request
 * idempotency record — returns the appointment it created, never a second.
 * Success is the committed database row, nothing less.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { jsonSafe } from '@/platform/http/serialize';
import { bookAppointment, bookingSchema, listPatientAppointments } from '@/platform/appointments/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-APPT-BOOK-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: bookingSchema,
  audit: true,
  handler: async ({ principal, body, request, requestId }) => {
    const bookingKey = request.headers.get('idempotency-key') ?? undefined;
    const { appointment, replayed } = await bookAppointment(principal, body, { bookingKey, requestId });
    return jsonSafe({
      appointmentId: appointment.id,
      status: appointment.status,
      mode: appointment.mode,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      expiresAt: appointment.expiresAt,
      replayed,
    });
  },
});

export const GET = defineRoute({
  id: 'TL-API-APPT-LIST-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return jsonSafe({ appointments: await listPatientAppointments(principal.userId) });
  },
});
