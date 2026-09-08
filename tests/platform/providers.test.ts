/**
 * TL-TEST-PROVIDERS-001 — Unconfigured provider behaviour
 *
 * This is the test that enforces Constitution P10: **no fake success.**
 *
 * It is arguably the most important suite in the foundation. A fabricated
 * "email sent" or "payment succeeded" is indistinguishable from a real one
 * until a patient misses an appointment or a clinic is not paid. Making the
 * absence of a provider a loud, typed failure is what keeps that class of bug
 * out of the codebase permanently — including from code written years from now
 * by someone who never read the Constitution.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES, isAppError } from '@/platform/kernel/errors';
import { createProviderSlot } from '@/platform/integrations/provider';
import {
  emailProvider,
  pushProvider,
  smsProvider,
  whatsAppProvider,
} from '@/platform/notifications/ports';
import { paymentProvider } from '@/platform/payments/ports';
import { searchProvider } from '@/platform/search/ports';
import { storageProvider } from '@/platform/storage/ports';
import { geocodingProvider, routingProvider } from '@/platform/location/ports';
import { analyticsProvider, sanitizeProperties } from '@/platform/analytics/ports';
import { errorTrackingProvider, reportError } from '@/platform/observability/ports';
import { selectChannels, sendNotification } from '@/platform/notifications';
import {
  CLINICAL_UPLOAD_CONTENT_TYPES,
  isAllowedClinicalUpload,
  isPubliclyAddressable,
  signedUrlTtlFor,
} from '@/platform/storage/ports';

const ALL_SLOTS = [
  emailProvider,
  smsProvider,
  whatsAppProvider,
  pushProvider,
  paymentProvider,
  storageProvider,
  searchProvider,
  geocodingProvider,
  routingProvider,
  analyticsProvider,
  errorTrackingProvider,
];

afterEach(() => {
  for (const slot of ALL_SLOTS) slot.set(null);
});

describe('no provider is configured in Phase 0', () => {
  it('reports every slot as unconfigured', () => {
    // Honest state (Constitution P9): the foundation ships with zero adapters,
    // and this asserts nobody quietly wired one in.
    for (const slot of ALL_SLOTS) {
      expect(slot.isConfigured(), `${slot.integrationName} should be unconfigured`).toBe(false);
    }
  });
});

describe('unconfigured providers fail loudly', () => {
  it('throws NOT_CONFIGURED instead of returning a fake payment success', async () => {
    // The single most dangerous fake in this product.
    try {
      await paymentProvider.get().createIntent({
        amount: { amountMinor: 9000n, currency: 'INR' },
        reference: 'lead_1',
        description: 'Lead purchase',
        idempotencyKey: 'idem_1',
      });
      expect.unreachable('an unconfigured payment provider must not succeed');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe(ERROR_CODES.NOT_CONFIGURED);
        expect(error.status).toBe(503);
        expect(error.message).toContain('payment gateway');
      }
    }
  });

  it('throws NOT_CONFIGURED rather than reporting an email as sent', async () => {
    await expect(
      emailProvider.get().send({ to: 'a@b.test', subject: 's', textBody: 'b' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_CONFIGURED });
  });

  it('applies to every port, including methods added later', async () => {
    // The proxy throws for ANY method, so a port that grows a new method next
    // year is protected without anyone remembering to add a guard.
    await expect(smsProvider.get().send({ to: '+911', body: 'x' })).rejects.toMatchObject({
      code: ERROR_CODES.NOT_CONFIGURED,
    });
    await expect(storageProvider.get().get('key')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_CONFIGURED,
    });
    await expect(
      searchProvider.get().search({ type: 'dentist', limit: 10 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_CONFIGURED });
    await expect(geocodingProvider.get().geocode('Raipur')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_CONFIGURED,
    });
    await expect(
      routingProvider.get().route(
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
        'driving',
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_CONFIGURED });
  });

  it('names the integration in the error so the fix is obvious', async () => {
    await expect(
      whatsAppProvider.get().send({ to: '+911', templateName: 't', languageCode: 'en' }),
    ).rejects.toThrow(/WhatsApp/);
  });
});

describe('provider slots', () => {
  it('uses an installed adapter once registered', async () => {
    interface TestPort {
      ping(): Promise<string>;
    }
    const slot = createProviderSlot<TestPort>('test');

    expect(slot.isConfigured()).toBe(false);
    slot.set({ ping: async () => 'pong' });

    expect(slot.isConfigured()).toBe(true);
    expect(await slot.get().ping()).toBe('pong');
  });

  it('reverts to failing when cleared', async () => {
    interface TestPort {
      ping(): Promise<string>;
    }
    const slot = createProviderSlot<TestPort>('test');
    slot.set({ ping: async () => 'pong' });
    slot.set(null);

    await expect(slot.get().ping()).rejects.toMatchObject({
      code: ERROR_CODES.NOT_CONFIGURED,
    });
  });

  it('is not mistaken for a promise', async () => {
    // Guards against `await provider` silently resolving to the proxy because
    // it looked thenable.
    interface TestPort {
      ping(): Promise<string>;
    }
    const slot = createProviderSlot<TestPort>('test');
    const value = slot.get() as unknown as { then?: unknown };
    expect(value.then).toBeUndefined();
  });
});

describe('notification dispatch', () => {
  it('reports failure per channel instead of throwing', async () => {
    // The caller usually cannot undo whatever triggered the notification, so it
    // needs a report rather than an exception.
    const result = await sendNotification({
      notificationId: 'TL-NOTIF-APPOINTMENT-CONFIRMED-001',
      recipient: {
        userId: 'usr_1',
        email: 'patient@example.test',
        phone: '+919876543210',
        pushTokens: ['tok_1'],
        locale: 'en',
        timezone: 'Asia/Kolkata',
      },
    });

    expect(result.anyDelivered).toBe(false);
    expect(result.outcomes.length).toBeGreaterThan(0);
    // Every outcome is a failure or a skip — never a fabricated 'sent'.
    expect(result.outcomes.every((o) => o.status !== 'sent')).toBe(true);
  });

  it('rejects an unregistered notification ID', async () => {
    await expect(
      sendNotification({
        notificationId: 'TL-NOTIF-DOES-NOT-EXIST-001',
        recipient: { userId: 'usr_1', locale: 'en', timezone: 'Asia/Kolkata' },
      }),
    ).rejects.toThrow(/unknown notification/i);
  });

  it('skips channels the recipient has no address for, with a reason', () => {
    const { selected, skipped } = selectChannels(['email', 'sms', 'push'], true, {
      userId: 'usr_1',
      email: 'a@b.test',
      locale: 'en',
      timezone: 'Asia/Kolkata',
    });

    expect(selected).toEqual(['email']);
    expect(skipped.map((s) => s.channel).sort()).toEqual(['push', 'sms']);
    expect(skipped[0]!.reason).toBeTruthy();
  });

  it('delivers transactional messages even when the channel is muted', () => {
    // A user who silenced notifications still needs to know their appointment
    // was cancelled.
    const { selected } = selectChannels(['email'], true, {
      userId: 'usr_1',
      email: 'a@b.test',
      locale: 'en',
      timezone: 'Asia/Kolkata',
      mutedChannels: ['email'],
    });
    expect(selected).toEqual(['email']);
  });

  it('withholds marketing without consent', () => {
    // Compliance, not preference.
    const withoutConsent = selectChannels(['email'], false, {
      userId: 'usr_1',
      email: 'a@b.test',
      locale: 'en',
      timezone: 'Asia/Kolkata',
    });
    expect(withoutConsent.selected).toEqual([]);
    expect(withoutConsent.skipped[0]!.reason).toMatch(/consent/i);

    const withConsent = selectChannels(['email'], false, {
      userId: 'usr_1',
      email: 'a@b.test',
      locale: 'en',
      timezone: 'Asia/Kolkata',
      marketingConsent: true,
    });
    expect(withConsent.selected).toEqual(['email']);
  });

  it('respects a mute for marketing', () => {
    const { selected } = selectChannels(['email'], false, {
      userId: 'usr_1',
      email: 'a@b.test',
      locale: 'en',
      timezone: 'Asia/Kolkata',
      marketingConsent: true,
      mutedChannels: ['email'],
    });
    expect(selected).toEqual([]);
  });
});

describe('document access policy', () => {
  it('gives clinical files the shortest signed-URL lifetime', () => {
    // Short enough that a URL in a browser history or a screenshot is dead.
    expect(signedUrlTtlFor('phi')).toBeLessThanOrEqual(60);
    expect(signedUrlTtlFor('phi')).toBeLessThan(signedUrlTtlFor('confidential'));
    expect(signedUrlTtlFor('confidential')).toBeLessThan(signedUrlTtlFor('public'));
  });

  it('makes only public objects publicly addressable', () => {
    expect(isPubliclyAddressable('public')).toBe(true);
    for (const level of ['internal', 'confidential', 'phi'] as const) {
      expect(isPubliclyAddressable(level)).toBe(false);
    }
  });

  it('allow-lists clinical upload types and excludes SVG', () => {
    // SVG can carry script: an "image" upload would be stored XSS.
    expect(isAllowedClinicalUpload('image/jpeg')).toBe(true);
    expect(isAllowedClinicalUpload('application/pdf')).toBe(true);
    expect(isAllowedClinicalUpload('image/svg+xml')).toBe(false);
    expect(isAllowedClinicalUpload('text/html')).toBe(false);
    expect(CLINICAL_UPLOAD_CONTENT_TYPES).not.toContain('image/svg+xml');
  });

  it('matches content types case-insensitively', () => {
    expect(isAllowedClinicalUpload('IMAGE/JPEG')).toBe(true);
  });
});

describe('analytics privacy', () => {
  it('strips identifying and clinical properties before dispatch', () => {
    const sanitized = sanitizeProperties({
      clinicId: 'org_1',
      email: 'patient@example.test',
      phone: '+919876543210',
      patientName: 'Asha',
      diagnosis: 'pulpitis',
      appointmentCount: 3,
    });

    expect(sanitized).toEqual({ clinicId: 'org_1', appointmentCount: 3 });
  });
});

describe('error tracking', () => {
  it('does nothing, and throws nothing, when unconfigured', async () => {
    // An error tracker being down must not turn a handled 500 into an
    // unhandled one.
    await expect(reportError(new Error('boom'), { requestId: 'req_1' })).resolves.toBeUndefined();
  });

  it('swallows a failing tracker', async () => {
    errorTrackingProvider.set({
      captureException: async () => {
        throw new Error('tracker is down');
      },
      captureMessage: async () => {},
    });

    await expect(reportError(new Error('boom'), { requestId: 'req_1' })).resolves.toBeUndefined();
  });
});
