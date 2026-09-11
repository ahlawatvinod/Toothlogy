/**
 * A patient's treatment plans — for the patient, or for a practice under the
 * patient's grant. Controls appear only for the side that may use them: the
 * patient decides a proposed plan; the proposing practice, with a
 * read-and-add grant, records progress or withdraws it. Estimates are the
 * practice's, tax included — not a bill.
 */

import { formatMoney } from '@/platform/money';
import type { TreatmentPlanView } from '@/platform/records/treatment-plans';
import { Badge, EmptyState, type BadgeTone } from '@/design-system';
import { CancelPlan, PlanDecision, PlanItemActions } from './treatment-plan-controls';

type MoneyCurrency = Parameters<typeof formatMoney>[0]['currency'];
type Viewer = { readonly kind: 'PATIENT' } | { readonly kind: 'PRACTICE'; readonly organizationId: string; readonly canWrite: boolean };

const STATUS: Readonly<Record<string, { tone: BadgeTone; patient: string; practice: string }>> = {
  PROPOSED: { tone: 'info', patient: 'Waiting for your decision', practice: 'Waiting for the patient' },
  ACCEPTED: { tone: 'success', patient: 'Accepted', practice: 'Accepted' },
  DECLINED: { tone: 'neutral', patient: 'Declined', practice: 'Declined by the patient' },
  COMPLETED: { tone: 'success', patient: 'Completed', practice: 'Completed' },
  CANCELLED: { tone: 'warning', patient: 'Withdrawn by the practice', practice: 'Withdrawn' },
};
const ITEM_STATUS: Readonly<Record<string, string>> = { PLANNED: 'Planned', DONE: 'Done', SKIPPED: 'Not done' };

export function TreatmentPlanList({ plans, viewer }: { plans: readonly TreatmentPlanView[]; viewer: Viewer }) {
  if (plans.length === 0) {
    return (
      <EmptyState
        title="No treatment plans"
        description={viewer.kind === 'PATIENT' ? 'A practice you share your record with, able to add to it, can propose one. You decide.' : 'Propose one here; the patient accepts or declines.'}
      />
    );
  }
  const money = (minor: bigint, currency: string) => formatMoney({ amountMinor: minor, currency: currency as MoneyCurrency }, 'en-IN');
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <ul className="tl-list" aria-label="Treatment plans">
      {plans.map((plan) => {
        const status = STATUS[plan.status]!;
        const ownPractice = viewer.kind === 'PRACTICE' && viewer.canWrite && viewer.organizationId === plan.organization.id;
        return (
          <li key={plan.id}>
            <section className="tl-stack" aria-label={`Treatment plan: ${plan.title}`}>
              <div className="tl-card__title-row">
                <strong>{plan.title}</strong>
                <Badge tone={status.tone}>{viewer.kind === 'PATIENT' ? status.patient : status.practice}</Badge>
              </div>
              <span className="tl-list__meta">
                {plan.organization.name}
                {plan.author.displayName ? ` · ${plan.author.displayName}` : ''}
                {plan.dependent ? ` · for ${plan.dependent.name}` : ''} · proposed {date(plan.createdAt)} · estimate {money(plan.estimateMinor, plan.currency)} including tax
              </span>
              {plan.notes ? <p style={{ margin: 0 }}>{plan.notes}</p> : null}
              <ol className="tl-stack" aria-label={`Treatments in ${plan.title}`} style={{ margin: 0 }}>
                {plan.items.map((item) => (
                  <li key={item.id} className="tl-stack">
                    <span>
                      {item.description}
                      {item.teeth.length > 0 ? ` (teeth ${item.teeth.join(', ')})` : ''} — {money(item.estimateMinor, plan.currency)} · {ITEM_STATUS[item.status]}
                      {item.skipReason ? `: ${item.skipReason}` : ''}
                    </span>
                    {ownPractice && plan.status === 'ACCEPTED' && item.status === 'PLANNED' ? <PlanItemActions planId={plan.id} itemId={item.id} label={item.description} /> : null}
                  </li>
                ))}
              </ol>
              {plan.status === 'DECLINED' && plan.declineReason ? <p className="tl-muted" style={{ margin: 0 }}>Reason given: {plan.declineReason}</p> : null}
              {plan.status === 'CANCELLED' ? (
                <p className="tl-muted" style={{ margin: 0 }}>
                  Withdrawn{plan.cancelledAt ? ` on ${date(plan.cancelledAt)}` : ''}: {plan.cancelledReason}
                </p>
              ) : null}
              {plan.status === 'COMPLETED' && plan.completedAt ? <p className="tl-muted" style={{ margin: 0 }}>Completed on {date(plan.completedAt)}.</p> : null}
              {viewer.kind === 'PATIENT' && plan.status === 'PROPOSED' ? (
                <>
                  <p className="tl-muted" style={{ margin: 0 }}>These are the practice’s estimates, not a bill. You pay the practice directly.</p>
                  <PlanDecision planId={plan.id} title={plan.title} />
                </>
              ) : null}
              {ownPractice && (plan.status === 'PROPOSED' || plan.status === 'ACCEPTED') ? <CancelPlan planId={plan.id} title={plan.title} /> : null}
            </section>
          </li>
        );
      })}
    </ul>
  );
}
