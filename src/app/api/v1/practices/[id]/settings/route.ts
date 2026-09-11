/**
 * TL-API-PRACTICE-SETTINGS-001 — PATCH /api/v1/practices/:id/settings
 *
 * How a dentist takes appointments at one location: fee, slot length, notice,
 * booking window, instant vs request booking, video / home visit / emergency,
 * and a pause switch. Either the dentist or the clinic may change them; the
 * service decides which, and answers "not found" to anyone else.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { practiceSettingsSchema, updatePracticeSettings } from '@/platform/dentists/practice';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-PRACTICE-SETTINGS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: practiceSettingsSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    const practice = await updatePracticeSettings(principal, params.id, body, { requestId });
    return {
      practiceId: practice.id,
      settings: {
        consultationFeeMinor: practice.consultationFeeMinor,
        autoConfirm: practice.autoConfirm,
        acceptsVideo: practice.acceptsVideo,
        acceptsHomeVisit: practice.acceptsHomeVisit,
        acceptsEmergency: practice.acceptsEmergency,
        slotMinutes: practice.slotMinutes,
        bufferMinutes: practice.bufferMinutes,
        minNoticeMinutes: practice.minNoticeMinutes,
        maxAdvanceDays: practice.maxAdvanceDays,
        bookingPaused: practice.bookingPaused,
      },
    };
  },
});
