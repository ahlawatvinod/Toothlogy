/**
 * A call to action that responds to hover and press.
 *
 * WHY THIS EXISTS RATHER THAN A CSS `:hover` TRANSFORM
 * The reference brief asks for hover and tap interactions on the hero's
 * buttons specifically. CSS can do the hover; it cannot do the press, because
 * `:active` ends the moment the pointer is released and gives no spring back.
 * Framer Motion is already on the page for the carousel, so this costs a
 * wrapper rather than a dependency.
 *
 * It stays a real `next/link`, so client-side navigation, prefetching and
 * middle-click all behave exactly as they did before the motion was added.
 */

'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const MotionLink = motion.create(Link);

export function MotionCta({
  href,
  className,
  children,
}: {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <MotionLink
      href={href}
      className={className}
      // A visitor who asked for reduced motion gets a button that does not
      // move at all — the CSS hover colour still tells them it is interactive.
      whileHover={reduceMotion ? undefined : { scale: 1.03, y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.97, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      {children}
    </MotionLink>
  );
}
