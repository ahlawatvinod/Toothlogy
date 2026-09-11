/**
 * A star rating, read-only: five characters for the eye, one sentence for
 * a screen reader.
 */

export function Stars({ rating, label }: { rating: number; label?: string }) {
  const whole = Math.round(rating);
  return (
    <span role="img" aria-label={label ?? `${rating} out of 5 stars`} style={{ letterSpacing: '0.05em' }}>
      <span aria-hidden="true">{'★'.repeat(whole)}{'☆'.repeat(5 - whole)}</span>
    </span>
  );
}
