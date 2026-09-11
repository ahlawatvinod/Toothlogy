/**
 * Choosing 1–5 stars: a real radio group, so keyboards and screen readers
 * work without a custom widget.
 */

'use client';

export function StarInput({ value, onChange, name }: { value: number; onChange: (next: number) => void; name: string }) {
  return (
    <fieldset className="tl-fieldset">
      <legend className="tl-fieldset__legend">Your rating</legend>
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="tl-checkbox">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
            <span>
              <span aria-hidden="true">{'★'.repeat(n)}</span> {n} star{n === 1 ? '' : 's'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
