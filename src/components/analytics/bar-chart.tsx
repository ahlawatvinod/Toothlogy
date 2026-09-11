/**
 * A per-day bar chart as plain SVG — no chart library, no script. Screen
 * readers get the total and the busiest day in the label, and every bar
 * carries its own figure as a tooltip.
 */

export function BarChart({ label, data }: { label: string; data: ReadonlyArray<{ day: string; count: number }> }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  const busiest = data.reduce((best, d) => (d.count > best.count ? d : best), data[0] ?? { day: '', count: 0 });
  const width = 100 / Math.max(1, data.length);
  const summary = `${label}: ${total} in ${data.length} days${busiest.count > 0 ? `; busiest ${busiest.day} with ${busiest.count}` : ''}.`;
  return (
    <figure className="tl-stack" style={{ margin: 0 }}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={summary} style={{ width: '100%', height: '7rem', color: 'var(--tl-color-accent, #0f766e)' }}>
        <line x1="0" y1="39.8" x2="100" y2="39.8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.4" />
        {data.map((d, i) => {
          const h = (d.count / max) * 38;
          return (
            <rect key={d.day} x={i * width + width * 0.12} y={40 - h} width={width * 0.76} height={h} fill="currentColor" fillOpacity={0.8}>
              <title>{`${d.day}: ${d.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="tl-muted">{summary}</figcaption>
    </figure>
  );
}

/** A labelled figure. `value` null renders as an em dash (no data, not zero). */
export function Figure({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <strong>{value ?? '—'}</strong>
        {hint ? <span className="tl-list__meta"> {hint}</span> : null}
      </dd>
    </div>
  );
}
