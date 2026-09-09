'use client';

/**
 * TL-CMP-COUNTER-001 — Animated number
 *
 * Counts up to a value when it scrolls into view.
 *
 * IT ONLY EVER ANIMATES A NUMBER IT WAS GIVEN
 * The `value` prop is the real figure, rendered as the final frame and as the
 * server-rendered HTML. This component cannot invent a statistic: with no
 * JavaScript, with reduced motion, or before hydration, the exact same number is
 * on screen. The animation is presentation, never the source of the value
 * (Constitution P9).
 *
 * ACCESSIBILITY
 * The counting digits are `aria-hidden` and the final value is exposed to
 * assistive technology in a visually hidden span. Otherwise a screen reader
 * announces sixty intermediate values as the number ticks, or reads "0" — the
 * value at the moment it happened to look.
 */

import { useEffect, useRef, useState } from 'react';

export interface CounterProps {
  /** The real value. Rendered verbatim when motion is off or JS is unavailable. */
  readonly value: number;
  readonly durationMs?: number;
  /** Rendered after the number, inside the same accessible label. */
  readonly suffix?: string;
}

export function Counter({ value, durationMs = 1100, suffix = '' }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Someone who asked for reduced motion gets the final value, not a count-up.
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined' || value <= 0) return;

    let frame = 0;
    let start: number | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();

          const step = (now: number) => {
            start ??= now;
            const t = Math.min((now - start) / durationMs, 1);
            // Ease-out cubic: quick to most of the value, then a visible settle.
            setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
            if (t < 1) frame = requestAnimationFrame(step);
          };

          setDisplay(0);
          frame = requestAnimationFrame(step);
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref}>
      <span aria-hidden="true">
        {display}
        {suffix}
      </span>
      <span className="tl-visually-hidden">
        {value}
        {suffix}
      </span>
    </span>
  );
}
