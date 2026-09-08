/**
 * TL-TEST-EVENTS-001 — Domain event bus
 *
 * Two properties are load-bearing for a 35-division architecture: an
 * unregistered event name must fail loudly, and one broken subscriber must not
 * take down the publisher or its siblings.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  clearAllSubscribers,
  publish,
  subscribe,
  subscriberCount,
  toOutboxRecord,
} from '@/platform/events';
import { isKnownEvent } from '@/registry/events';

describe('registered names', () => {
  it('rejects publishing an unregistered event', () => {
    // A typo would otherwise "succeed" while reaching no subscriber: the
    // appointment confirms, no notification is sent, nothing reports an error.
    expect(publish('APPOINTMENT_CONFIRMD', {})).rejects.toThrow(/unregistered event/i);
  });

  it('rejects subscribing to an unregistered event', () => {
    expect(() => subscribe('NOT_A_REAL_EVENT', () => {})).toThrow(/unregistered event/i);
  });

  it('recognises the events named in the founding specification', () => {
    for (const name of [
      'USER_CREATED',
      'DENTIST_VERIFIED',
      'CLINIC_VERIFIED',
      'APPOINTMENT_CREATED',
      'APPOINTMENT_CONFIRMED',
      'APPOINTMENT_CANCELLED',
      'LEAD_CREATED',
      'LEAD_ACCEPTED',
      'PAYMENT_COMPLETED',
      'REVIEW_CREATED',
      'MESSAGE_RECEIVED',
      'ORDER_CREATED',
      'DEVICE_CONNECTED',
    ]) {
      expect(isKnownEvent(name), `${name} should be registered`).toBe(true);
    }
  });
});

describe('publication', () => {
  it('delivers to every subscriber', async () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribe('USER_CREATED', first);
    subscribe('USER_CREATED', second);

    await publish('USER_CREATED', { userId: 'usr_1' });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('passes payload and metadata in the envelope', async () => {
    const handler = vi.fn();
    subscribe('USER_CREATED', handler);

    await publish('USER_CREATED', { userId: 'usr_9' }, { requestId: 'req_1', actor: 'usr_9' });

    const event = handler.mock.calls[0]![0] as {
      name: string;
      payload: { userId: string };
      requestId?: string;
      occurredAt: Date;
    };
    expect(event.name).toBe('USER_CREATED');
    expect(event.payload.userId).toBe('usr_9');
    expect(event.requestId).toBe('req_1');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('succeeds with no subscribers', async () => {
    // A publisher must not know or care whether anyone is listening.
    await expect(publish('DEVICE_CONNECTED', { deviceId: 'dev_1' })).resolves.toBeDefined();
  });

  it('isolates a failing subscriber from the others', async () => {
    // A notification provider being down must not roll back a confirmed
    // appointment.
    const broken = vi.fn(() => {
      throw new Error('subscriber exploded');
    });
    const healthy = vi.fn();

    subscribe('APPOINTMENT_CONFIRMED', broken);
    subscribe('APPOINTMENT_CONFIRMED', healthy);

    await expect(publish('APPOINTMENT_CONFIRMED', { id: 'apt_1' })).resolves.toBeDefined();
    expect(healthy).toHaveBeenCalledOnce();
  });

  it('isolates a rejecting async subscriber', async () => {
    const rejecting = vi.fn(async () => {
      throw new Error('async failure');
    });
    const healthy = vi.fn();

    subscribe('PAYMENT_COMPLETED', rejecting);
    subscribe('PAYMENT_COMPLETED', healthy);

    await expect(publish('PAYMENT_COMPLETED', {})).resolves.toBeDefined();
    expect(healthy).toHaveBeenCalledOnce();
  });

  it('awaits async subscribers before resolving', async () => {
    let finished = false;
    subscribe('USER_CREATED', async () => {
      await new Promise((r) => setTimeout(r, 10));
      finished = true;
    });

    await publish('USER_CREATED', {});
    expect(finished).toBe(true);
  });
});

describe('subscription lifecycle', () => {
  it('stops delivering after unsubscribe', async () => {
    const handler = vi.fn();
    const subscription = subscribe('USER_CREATED', handler);

    subscription.unsubscribe();
    await publish('USER_CREATED', {});

    expect(handler).not.toHaveBeenCalled();
    expect(subscriberCount('USER_CREATED')).toBe(0);
  });

  it('clears all subscribers', () => {
    subscribe('USER_CREATED', () => {});
    subscribe('ORDER_CREATED', () => {});
    clearAllSubscribers();

    expect(subscriberCount('USER_CREATED')).toBe(0);
    expect(subscriberCount('ORDER_CREATED')).toBe(0);
  });
});

describe('transactional outbox', () => {
  it('builds a row carrying the event and its correlation metadata', () => {
    const record = toOutboxRecord(
      {
        name: 'ORDER_CREATED',
        payload: { orderId: 'ord_1' },
        occurredAt: new Date('2026-01-01T00:00:00Z'),
        requestId: 'req_1',
        actor: 'usr_1',
      },
      'out_1',
    );

    expect(record.id).toBe('out_1');
    expect(record.name).toBe('ORDER_CREATED');
    expect(record.requestId).toBe('req_1');
  });

  it('normalises absent metadata to null for the database', () => {
    const record = toOutboxRecord(
      { name: 'USER_CREATED', payload: {}, occurredAt: new Date() },
      'out_2',
    );
    expect(record.requestId).toBeNull();
    expect(record.actor).toBeNull();
  });
});
