/**
 * TOOTHLOGY PAGE & COMPONENT REGISTRY
 *
 * PAGES are addressable user surfaces. COMPONENTS are the design-system building
 * blocks pages are made of.
 *
 * Two fields on a page carry more weight than they look:
 *
 * - **`indexable`** drives robots and sitemap generation. Toothlogy's DISCOVER
 *   pillar depends on dentist and clinic pages being indexed, and its TRUST
 *   obligation depends on patient and clinical surfaces never being indexed.
 *   Making this an explicit per-page field means neither happens by accident.
 * - **`certificationId`** links the page to its certification record
 *   (Constitution §7). `null` means uncertified — which is the honest state for
 *   every page in Phase 0, since the certification standard only becomes binding
 *   from Prompt 3.
 *
 * Only pages that actually exist as routes are registered.
 */

import type { ComponentEntry, Page } from './types';

export const PAGES: readonly Page[] = [
  {
    id: 'TL-PAGE-HOME-001',
    name: 'Home',
    description:
      'The public entry point. In Phase 0 it presents the platform foundation and its honest build status; it becomes the patient-facing landing experience in Phase 2.',
    status: 'implemented',
    phase: 2,
    route: '/',
    moduleId: 'TL-EXPERIENCE-SHELL-001',
    audience: 'anonymous',
    permissions: [],
    indexable: true,
    certificationId: 'TL-FE-HOME-001',
  },
  {
    id: 'TL-PAGE-DESIGNSYSTEM-001',
    name: 'Design System Reference',
    description:
      'Living reference for design tokens and component primitives in every theme and both text directions. Internal tooling: never indexed, and gated by the design-system-reference feature flag.',
    status: 'implemented',
    phase: 2,
    route: '/design-system',
    moduleId: 'TL-EXPERIENCE-DESIGNSYSTEM-001',
    audience: 'anonymous',
    permissions: [],
    indexable: false,
    certificationId: 'TL-FE-DESIGNSYSTEM-001',
  },
] as const;

export const PAGE_BY_ID: ReadonlyMap<string, Page> = new Map(PAGES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * `ariaPattern` names the WAI-ARIA Authoring Practices pattern a component
 * implements, or `null` where no pattern applies. It is recorded so that
 * accessibility review has a stated target to test against rather than a
 * subjective impression — the ACCESSIBILITY certification dimension checks the
 * component against its declared pattern.
 */
export const COMPONENTS: readonly ComponentEntry[] = [
  {
    id: 'TL-CMP-BUTTON-001',
    name: 'Button',
    description:
      'Primary interactive control. Variants for intent and size, with a busy state that stays announced to assistive technology while disabled to pointer input.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/button',
    ariaPattern: 'button',
  },
  {
    id: 'TL-CMP-FIELD-001',
    name: 'Field',
    description:
      'Form field wrapper binding label, hint, error and control together. Errors are associated by aria-describedby and announced, not merely coloured red.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/field',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-INPUT-001',
    name: 'Input',
    description: 'Text input primitive with invalid state wired to the Field contract.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/input',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-CARD-001',
    name: 'Card',
    description: 'Surface container with header, body and footer regions.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/card',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-BADGE-001',
    name: 'Badge',
    description:
      'Compact status label. Never conveys meaning by colour alone — every variant carries text.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/badge',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-ALERT-001',
    name: 'Alert',
    description:
      'Inline message for info, success, warning and danger. Assertive variants use role="alert" so they interrupt; passive ones do not.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/alert',
    ariaPattern: 'alert',
  },
  {
    id: 'TL-CMP-DIALOG-001',
    name: 'Dialog',
    description:
      'Modal dialog built on the native <dialog> element, giving focus trapping, Escape handling and the top layer without a bespoke implementation.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/dialog',
    ariaPattern: 'dialog (modal)',
  },
  {
    id: 'TL-CMP-TABLE-001',
    name: 'Table',
    description:
      'Data table with a caption, scoped headers, and horizontal scrolling contained to the table so the page body never scrolls sideways on mobile.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/table',
    ariaPattern: 'table',
  },
  {
    id: 'TL-CMP-TABS-001',
    name: 'Tabs',
    description:
      'Tabbed navigation with full arrow-key roving focus, implementing the ARIA tabs pattern rather than styled buttons.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/tabs',
    ariaPattern: 'tabs (manual activation)',
  },
  {
    id: 'TL-CMP-SKELETON-001',
    name: 'Skeleton',
    description:
      'Loading placeholder that respects prefers-reduced-motion and is hidden from assistive technology while a live region announces the loading state instead.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/skeleton',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-SPINNER-001',
    name: 'Spinner',
    description: 'Indeterminate progress indicator with an accessible label.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/spinner',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-STATE-001',
    name: 'State Views',
    description:
      'Empty, error and loading state components. First-class primitives because these three states are certification dimensions, not edge cases to be improvised per screen (Constitution §7).',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/state',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-ICON-001',
    name: 'Icon',
    description:
      'The single stroked icon set. Local rather than a package, so the product cannot end up with two icon styles; aria-hidden unless given a title, since almost every icon sits beside a label that already names the thing.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/icon',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-LOGO-001',
    name: 'Logo',
    description:
      'The Toothlogy lockup. The mark is inline SVG so it costs no request and picks up the theme; the wordmark is real text at two weights, so it stays selectable, translatable and legible to a screen reader.',
    status: 'implemented',
    phase: 2,
    module: '@/components/brand/logo',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-REVEAL-001',
    name: 'Reveal',
    description:
      'Scroll-triggered section entrance. Hides its content only when scripting is available AND motion is wanted, so a reduced-motion or no-JavaScript visitor is never left with a blank page.',
    status: 'implemented',
    phase: 2,
    module: '@/components/motion/reveal',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-COUNTER-001',
    name: 'Counter',
    description:
      'Counts a number into view. Renders the real value server-side and can never invent one; the intermediate values are aria-hidden so a screen reader announces the figure once rather than sixty times.',
    status: 'implemented',
    phase: 2,
    module: '@/components/motion/counter',
    ariaPattern: null,
  },
  {
    id: 'TL-CMP-THEMETOGGLE-001',
    name: 'Theme Toggle',
    description:
      'Switches between light, dark and system themes, persisting the choice and applying it before first paint to avoid a flash of the wrong theme.',
    status: 'implemented',
    phase: 2,
    module: '@/design-system/components/theme-toggle',
    ariaPattern: null,
  },
] as const;

export const COMPONENT_BY_ID: ReadonlyMap<string, ComponentEntry> = new Map(
  COMPONENTS.map((c) => [c.id, c]),
);
