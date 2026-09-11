/**
 * TOOTHLOGY NOTIFICATION TEMPLATES
 *
 * Renders a registered notification for one channel and locale from the
 * `NotificationTemplate` table, falling back — in order — to the default
 * locale's template, then to the registry's own name and description.
 *
 * The final fallback exists so a missing template degrades to a plain but
 * truthful message ("Appointment confirmed") rather than to nothing. It never
 * invents detail: with no template there are no interpolated values to show.
 */

import { NOTIFICATION_BY_ID } from '@/registry/events';
import type { NotificationChannel } from '@/registry/types';
import { hasDatabase } from '../config';
import { db } from '../db/client';

const CHANNEL_TO_DB = {
  in_app: 'IN_APP',
  push: 'PUSH',
  email: 'EMAIL',
  sms: 'SMS',
  whatsapp: 'WHATSAPP',
} as const;

export interface RenderedMessage {
  readonly subject: string;
  readonly body: string;
  /** Provider-side template id (WhatsApp; SMS under India's DLT regime). */
  readonly providerTemplateId: string | null;
  /** Values in placeholder order, for providers that take positional params. */
  readonly parameters: readonly string[];
  /** True when no template existed and the registry text was used. */
  readonly fallback: boolean;
}

export type TemplateValues = Readonly<Record<string, string | number>>;

export function interpolate(template: string, values: TemplateValues): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

/** Placeholder names in the order they first appear. */
export function placeholders(template: string): string[] {
  const seen: string[] = [];
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    if (!seen.includes(match[1]!)) seen.push(match[1]!);
  }
  return seen;
}

export async function renderMessage(
  notificationId: string,
  channel: NotificationChannel,
  locale: string,
  values: TemplateValues = {},
): Promise<RenderedMessage> {
  const definition = NOTIFICATION_BY_ID.get(notificationId);

  let template: { subject: string | null; body: string; providerTemplateId: string | null } | null =
    null;

  if (hasDatabase()) {
    const dbChannel = CHANNEL_TO_DB[channel];
    // Language-only fallback before the default: `hi-IN` → `hi` → `en`.
    const candidates = [...new Set([locale, locale.split('-')[0]!, 'en'])];
    const rows = await db().notificationTemplate.findMany({
      where: { notificationId, channel: dbChannel, locale: { in: candidates }, isActive: true },
    });
    for (const candidate of candidates) {
      const row = rows.find((r) => r.locale === candidate);
      if (row) {
        template = row;
        break;
      }
    }
    // Push reuses the in-app copy when it has none of its own: they are the
    // same short sentence on a different surface.
    if (!template && channel === 'push') {
      const inApp = await db().notificationTemplate.findFirst({
        where: { notificationId, channel: 'IN_APP', locale: { in: candidates }, isActive: true },
      });
      if (inApp) template = inApp;
    }
  }

  if (!template) {
    return {
      subject: definition?.name ?? 'Toothlogy',
      body: definition?.description ?? '',
      providerTemplateId: null,
      parameters: [],
      fallback: true,
    };
  }

  const subject = interpolate(template.subject ?? definition?.name ?? 'Toothlogy', values);
  const body = interpolate(template.body, values);
  const parameters = placeholders(template.body).map((name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : '',
  );

  return {
    subject,
    body,
    providerTemplateId: template.providerTemplateId,
    parameters,
    fallback: false,
  };
}

/** Minimal HTML for email: escaped paragraphs and one optional action link. */
export function toEmailHtml(body: string, link?: { href: string; label: string }): string {
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const action = link
    ? `<p><a href="${escape(link.href)}" style="display:inline-block;padding:10px 16px;background:#0b7285;color:#ffffff;border-radius:6px;text-decoration:none">${escape(link.label)}</a></p>`
    : '';

  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2933">${paragraphs}${action}<p style="color:#667085;font-size:12px">Toothlogy</p></body></html>`;
}
