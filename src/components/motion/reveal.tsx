'use client';

/**
 * TL-CMP-REVEAL-001 — Scroll reveal
 *
 * Fades and lifts a section into place the first time it enters the viewport.
 *
 * WHY THIS IS ~40 LINES AND NOT AN ANIMATION LIBRARY
 * The animation itself is three CSS properties. What actually needs JavaScript
 * is the single question "is this on screen yet", which `IntersectionObserver`
 * answers natively. Pulling in a runtime animation library to do that would add
 * a dependency to the critical path and, more importantly, force every section
 * that uses it to become a client component — on a site that is server-rendered
 * almost end to end. Here only this wrapper hydrates; its children stay server
 * components and ship no JavaScript of their own.
 *
 * THREE FAILURE MODES IT HAS TO SURVIVE
 * 1. **Reduced motion.** The hidden-before-revealed state lives inside a
 *    `prefers-reduced-motion: no-preference` block in CSS, so a visitor who asked
 *    for reduced motion never has content hidden from them in the first place.
 * 2. **No JavaScript.** The same hidden state is scoped to `.tl-js`, set by the
 *    inline theme script. Without scripting the content is simply visible.
 * 3. **Already on screen.** The observer fires immediately for elements in the
 *    initial viewport, so above-the-fold content does not wait for a scroll.
 *
 * It reveals once and then disconnects — content that re-hides when scrolled
 * past is a distraction, and an observer left attached is a cost with no payoff.
 */

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '@/design-system';

export interface RevealProps {
  readonly children: ReactNode;
  /** Rendered element. Use `li`, `section` etc. so the wrapper adds no extra DOM. */
  readonly as?: ElementType;
  /**
   * Delay in milliseconds, for staggering siblings. Kept as a CSS custom
   * property rather than a JS timer so the browser owns the scheduling and the
   * reduced-motion rule can neutralise it along with everything else.
   */
  readonly delay?: number;
  /** `up` is the default lift; `none` fades only, for elements already in place. */
  readonly variant?: 'up' | 'none' | 'scale';
  readonly className?: string;
}

export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  variant = 'up',
  className,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Older browsers without IntersectionObserver get the content immediately
    // rather than a permanently blank section.
    //
    // The class is added to the node directly rather than through setState.
    // Synchronously setting state in an effect body triggers a second render
    // pass for every wrapped section on the page; writing the class is the same
    // end result, and updating the DOM for a capability the renderer cannot
    // know about is exactly what an effect is for.
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-revealed');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setRevealed(true);
          observer.disconnect();
        }
      },
      // A negative bottom margin holds the reveal until the element is properly
      // in view, so it does not fire while still clipped at the fold.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn('tl-reveal', `tl-reveal--${variant}`, revealed && 'is-revealed', className)}
      style={delay ? ({ '--tl-reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
