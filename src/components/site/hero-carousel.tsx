/**
 * The hero image carousel.
 *
 * WHY THE STATE LIVES IN A CONTEXT RATHER THAN IN THE CAROUSEL
 * The reference design puts the previous/next buttons at the right-hand end of
 * the statistics bar, which is a separate section further down the page — not
 * on the image. Two components that are not parent and child therefore have to
 * drive one carousel, so the index lives in a provider that wraps both. The
 * alternative, a decorative pair of arrows that move nothing, is exactly the
 * kind of control this repository does not ship.
 *
 * WHAT IS AND IS NOT SHOWN
 * Slides come from the approved-asset manifest and are passed in already
 * resolved. A slug with no delivered file resolves to null upstream and simply
 * is not in the array, so the carousel adapts to however many approved images
 * exist: it hides its own controls at one slide and disappears entirely at
 * zero. No placeholder, no stock photograph, no filler.
 *
 * MOTION
 * Framer Motion drives the crossfade, and `useReducedMotion` is honoured
 * everywhere: a visitor who asks for less motion gets an instant swap, no
 * scale, and no autoplay at all. Autoplay also stops permanently the moment
 * someone works the controls themselves — a carousel that keeps yanking the
 * slide away from the person steering it is hostile.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import NextImage from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export interface HeroSlide {
  readonly slug: string;
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  /** Short human label for the thumbnail's accessible name. */
  readonly label: string;
}

/** How long a slide rests before the next one arrives. */
const AUTOPLAY_MS = 5500;

interface CarouselState {
  readonly slides: readonly HeroSlide[];
  readonly index: number;
  readonly go: (next: number) => void;
  readonly step: (delta: number) => void;
  /** Set when the visitor has taken over; stops autoplay for the session. */
  readonly takeOver: () => void;
}

const CarouselContext = createContext<CarouselState | null>(null);

/** Lets the frame report hover/focus without re-rendering every consumer. */
const PauseContext = createContext<(paused: boolean) => void>(() => {});

function useCarousel(): CarouselState | null {
  return useContext(CarouselContext);
}

export function HeroCarouselProvider({
  slides,
  children,
}: {
  readonly slides: readonly HeroSlide[];
  readonly children: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const count = slides.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (count === 0) return 0;
        return ((current + delta) % count + count) % count;
      });
    },
    [count],
  );

  const takeOver = useCallback(() => setEngaged(true), []);

  // Autoplay. Skipped entirely for reduced motion, for a single slide, once
  // the visitor has used the controls, and while the pointer or keyboard
  // focus is inside the carousel.
  useEffect(() => {
    if (reduceMotion || engaged || paused || count < 2) return;
    const timer = window.setInterval(() => step(1), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, engaged, paused, count, step]);

  // A background tab should not advance: the visitor comes back to a slide
  // they never saw arrive, and the timer burns work for nothing.
  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const value = useMemo<CarouselState>(
    () => ({ slides, index, go, step, takeOver }),
    [slides, index, go, step, takeOver],
  );

  return (
    <CarouselContext.Provider value={value}>
      <PauseContext.Provider value={setPaused}>{children}</PauseContext.Provider>
    </CarouselContext.Provider>
  );
}

/**
 * The framed image with its floating furniture.
 *
 * `overlay` is the floating-card layer, passed in from the server component so
 * the cards' copy stays in the page's own source rather than being duplicated
 * inside a client bundle.
 */
export function HeroCarousel({ overlay }: { readonly overlay?: React.ReactNode }) {
  const carousel = useCarousel();
  const setPaused = useContext(PauseContext);
  const reduceMotion = useReducedMotion();

  if (!carousel || carousel.slides.length === 0) return null;

  const { slides, index, go, step, takeOver } = carousel;
  const slide = slides[index]!;
  const many = slides.length > 1;

  const select = (next: number) => {
    takeOver();
    go(next);
  };

  return (
    <div
      className="tl-showcase"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Atmospheric glow behind the frame. Decorative. */}
      <div className="tl-showcase__glow" aria-hidden="true" />

      <div
        className="tl-showcase__frame"
        aria-roledescription="carousel"
        aria-label="Toothlogy dental care"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            takeOver();
            step(1);
          } else if (event.key === 'ArrowLeft') {
            takeOver();
            step(-1);
          }
        }}
      >
        <div className="tl-showcase__stage">
          <AnimatePresence initial={false}>
            <motion.div
              key={slide.slug}
              className="tl-showcase__slide"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
              transition={{
                duration: reduceMotion ? 0 : 0.6,
                ease: [0.22, 0.61, 0.36, 1],
              }}
            >
              <NextImage
                src={slide.src}
                alt={slide.alt}
                width={slide.width}
                height={slide.height}
                sizes="(max-width: 64rem) 100vw, 58vw"
                // Only the first slide is part of the largest contentful
                // paint; the rest are genuinely below the fold of attention.
                loading={index === 0 ? 'eager' : 'lazy'}
                preload={index === 0}
                className="tl-showcase__img"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/*
         * Previous/next on the image itself. The reference also places a pair
         * at the end of the stats bar; both drive the same carousel, and both
         * are real buttons with real labels rather than chevron glyphs.
         */}
        {many ? (
          <>
            <button
              type="button"
              className="tl-showcase__arrow tl-showcase__arrow--prev"
              onClick={() => {
                takeOver();
                step(-1);
              }}
              aria-label="Previous image"
            >
              <Chevron direction="left" />
            </button>
            <button
              type="button"
              className="tl-showcase__arrow tl-showcase__arrow--next"
              onClick={() => {
                takeOver();
                step(1);
              }}
              aria-label="Next image"
            >
              <Chevron direction="right" />
            </button>
          </>
        ) : null}

      </div>

      {/* Floating cards sit OUTSIDE the frame: inside it the frame's own
          overflow would clip the parts that overhang its corners. */}
      {overlay}

      {many ? (
        <>
          <div className="tl-showcase__rail" role="tablist" aria-label="Choose an image">
            {slides.map((item, position) => (
              <button
                key={item.slug}
                type="button"
                role="tab"
                aria-selected={position === index}
                aria-label={item.label}
                className={
                  position === index
                    ? 'tl-showcase__thumb tl-showcase__thumb--active'
                    : 'tl-showcase__thumb'
                }
                onClick={() => select(position)}
              >
                <NextImage
                  src={item.src}
                  alt=""
                  width={item.width}
                  height={item.height}
                  sizes="72px"
                  loading="lazy"
                  className="tl-showcase__thumb-img"
                />
              </button>
            ))}
          </div>

          <div className="tl-showcase__dots">
            {slides.map((item, position) => (
              <button
                key={item.slug}
                type="button"
                className={
                  position === index ? 'tl-showcase__dot tl-showcase__dot--active' : 'tl-showcase__dot'
                }
                onClick={() => select(position)}
                aria-label={`Show ${item.label}`}
                aria-current={position === index}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The previous/next pair the reference puts at the end of the statistics bar.
 *
 * Renders nothing when there is no carousel to drive or only one slide, which
 * is what keeps it from becoming decoration.
 */
export function HeroCarouselNav() {
  const carousel = useCarousel();
  if (!carousel || carousel.slides.length < 2) return null;

  const { step, takeOver } = carousel;

  return (
    <div className="tl-trust__nav">
      <button
        type="button"
        className="tl-trust__navbutton"
        onClick={() => {
          takeOver();
          step(-1);
        }}
        aria-label="Previous image"
      >
        <Chevron direction="left" />
      </button>
      <button
        type="button"
        className="tl-trust__navbutton"
        onClick={() => {
          takeOver();
          step(1);
        }}
        aria-label="Next image"
      >
        <Chevron direction="right" />
      </button>
    </div>
  );
}

function Chevron({ direction }: { readonly direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
