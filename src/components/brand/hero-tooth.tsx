/**
 * Hero tooth — the decorative centrepiece of the home page.
 *
 * The same silhouette as the logo mark, drawn larger and lit: a vertical enamel
 * gradient, a cyan rim light down the right edge, occlusion in the furcation,
 * and a soft contact shadow beneath. The mark's app-tile is deliberately absent
 * — a rounded tile floating in the middle of a hero reads as a screenshot of an
 * icon rather than as artwork, and the tile has its own job in the header.
 *
 * Entirely decorative: `aria-hidden`, no title, and it carries no information
 * that is not also in the surrounding text.
 *
 * Inline SVG rather than a file so it inherits the theme — the rim light and
 * shadow are tinted per theme in CSS — and costs no second request in the
 * largest-contentful-paint window.
 */

import { cn } from '@/design-system';

export function HeroTooth({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 320 360"
      className={cn('tl-hero-tooth', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="tl-hero-enamel" x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#f4fafd" />
          <stop offset="0.78" stopColor="#dceaf3" />
          <stop offset="1" stopColor="#c3d8e6" />
        </linearGradient>
        <linearGradient id="tl-hero-rim" x1="1" y1="0.2" x2="0.4" y2="0.9">
          <stop offset="0" stopColor="#7fe3f0" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#35b6d8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2a6698" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="tl-hero-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#0f6d8c" stopOpacity="0.34" />
          <stop offset="1" stopColor="#0f6d8c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tl-hero-occlusion" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#93b3c7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#93b3c7" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Contact shadow. Elliptical and offset down, so the tooth reads as
          hovering above the surface rather than pasted onto it. */}
      <ellipse cx="160" cy="334" rx="86" ry="18" fill="url(#tl-hero-shadow)" />

      {/* Body */}
      <path
        fill="url(#tl-hero-enamel)"
        d="M160 24c-56 0-98 29-104 85-4 37 7 72 16 106 12 45 20 90 24 122 3 19 11 29 21 29 12 0 19-12 22-32 5-48 12-80 21-80s16 32 21 80c3 20 10 32 22 32 10 0 18-10 21-29 4-32 12-77 24-122 9-34 20-69 16-106-6-56-48-85-104-85z"
      />

      {/* Rim light down the lit edge. It traces the right half of the same
          outline and stops before the root tip — carried all the way round it
          reads as a stray cyan line hanging off the tooth rather than as light. */}
      <path
        fill="none"
        stroke="url(#tl-hero-rim)"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
        d="M168 25c52 3 91 32 96 84 4 37-7 72-16 106-8 30-14 59-19 84"
      />

      {/* Specular highlight across the upper-left crown. */}
      <path
        fill="#ffffff"
        fillOpacity="0.92"
        d="M92 96c17-27 44-42 68-40 12 1 10 12-4 17-26 9-46 26-57 47-8 16-19 12-19-3 0-7 4-14 12-21z"
      />
      <ellipse cx="118" cy="168" rx="15" ry="42" fill="#ffffff" fillOpacity="0.5" />

      {/* Occlusion where the roots divide. */}
      <path
        fill="url(#tl-hero-occlusion)"
        d="M160 216c9 0 15 21 20 54-8-14-15-22-20-22s-12 8-20 22c5-33 11-54 20-54z"
      />

      {/* Sparkle, matching the mark. */}
      <path
        fill="#ffffff"
        d="M216 92l7 26 26 7-26 7-7 26-7-26-26-7 26-7z"
        opacity="0.95"
      />
    </svg>
  );
}
