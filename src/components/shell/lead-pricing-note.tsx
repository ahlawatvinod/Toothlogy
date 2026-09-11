/**
 * How leads are priced, from the configured standard rule — never a number
 * typed into a page. When no rule (or tax rate) is configured, says so
 * instead of stating a price.
 */

import { standardLeadPricing } from '@/platform/billing/service';
import { formatMoney } from '@/platform/money';

export async function LeadPricingNote() {
  const quote = await standardLeadPricing('IN').catch(() => null);
  if (!quote) {
    return <p style={{ margin: 0 }}>The price of a lead is shown in your wallet before you pay anything.</p>;
  }
  const each = formatMoney({ amountMinor: quote.grossMinor, currency: quote.currency }, 'en-IN');
  const net = formatMoney({ amountMinor: quote.netMinor, currency: quote.currency }, 'en-IN');
  const minimum = formatMoney({ amountMinor: quote.grossMinor * BigInt(quote.minimumRechargeLeads), currency: quote.currency }, 'en-IN');
  const gst = `${(quote.taxRateBasisPoints / 100).toLocaleString('en-IN')}% GST`;
  return (
    <p style={{ margin: 0 }}>
      Your first <strong>{quote.freeLeadAllowance}</strong> qualified leads are free. After that, each qualified lead costs <strong>{net} + {gst}</strong> ({each}), paid from a prepaid wallet; the smallest top-up is {quote.minimumRechargeLeads} leads ({minimum}). Duplicate, invalid, test and unqualified enquiries are never charged, and you can dispute a charge.
    </p>
  );
}
