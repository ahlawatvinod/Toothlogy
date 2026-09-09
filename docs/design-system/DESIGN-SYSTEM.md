# Toothlogy Design System

**Document ID:** `TL-DOC-DESIGNSYSTEM-001`
**Module:** `TL-EXPERIENCE-DESIGNSYSTEM-001` · Division 02
**Live reference:** `/design-system` (development only — flag-gated)

---

## 1. Why tokens

Every visual decision resolves to a token in
[`src/app/globals.css`](../../src/app/globals.css). No component hard-codes a
colour, spacing value or radius.

Toothlogy must support light, dark, system and user-selected themes, multiple
palettes, and eventually Prime's premium identity — **without forking
components**. With tokens, a theme is a different set of variable values. Without
them, a theme is a rewrite of every component, and the second theme never ships.

### Semantic, never literal

Tokens are named for their **role**, not their appearance:

```css
--tl-color-danger      /* ✅ survives a palette change */
--tl-color-red         /* ❌ becomes a lie the moment it is not red */
```

`--tl-color-red: blue` is how design systems die.

---

## 2. Theming

Four states, resolved in this order:

```css
:root                                          /* light — the base */
@media (prefers-color-scheme: dark)
  :root:not([data-theme="light"])              /* dark, for "system" users */
:root[data-theme="dark"]                       /* dark, explicitly chosen */
:root[data-theme="light"]                      /* light, explicitly chosen */
```

Two rules make this robust:

1. **Every colour is defined in `:root` first.** A token defined only inside a
   media query is an invisible element in the other theme.
2. **The dark media query is guarded** with `:not([data-theme="light"])`, so an
   explicit light choice beats the OS setting.

**System is a real, selectable option** — not an absence of choice. A user whose
OS switches at sunset expects the site to follow, and a two-state toggle
silently overrides that.

### No flash of the wrong theme

The server cannot know a visitor's stored preference. Applying the theme after
hydration would flash white on every navigation for a dark-mode user — jarring
generally, and genuinely unpleasant for someone using dark mode for light
sensitivity.

[`THEME_SCRIPT`](../../src/design-system/components/theme-script.ts) runs
synchronously in `<head>` before first paint. It is inlined as a string because
it must execute before any bundle loads, and it is kept tiny because it blocks
rendering.

---

## 3. Scales

| Scale | Values | Note |
|---|---|---|
| Spacing | 0, 4, 8, 12, 16, 24, 32, 48, 64px | One 4px-based scale platform-wide |
| Radius | 4, 8, 12px, full | |
| Type | 12 → 36px, in `rem` | `rem` so it scales with the user's browser font size |
| Breakpoints | 480 / 768 / 1024 / 1280px | Mobile-first |
| Touch target | 44px minimum | Below this, taps start missing on real devices |
| Line length | 68ch for prose | Longer lines lose the eye on the return sweep |

Type is in `rem`, never `px`: fixed px ignores a user's browser font-size
preference, which matters for a health product with older users.

---

## 4. Accessibility decisions

These are the choices that are easy to get wrong and expensive to retrofit.

**Colour is never the only signal.** Every badge and alert carries text; the
alert's severity word is rendered visually hidden. Around 8% of men have a
colour-vision deficiency, for whom a red panel and a green panel are the same
panel.

**A busy button is `aria-busy`, not `disabled`.** A `disabled` element leaves the
tab order, so a keyboard user's focus is thrown to the top of the document the
instant they submit a form. The button stays focusable and blocks activation
instead. It also keeps its label — replacing text with a spinner destroys the
accessible name mid-action.

**Field errors are associated, not merely visible.** `Field` owns the generated
id and wires `htmlFor`, `aria-describedby`, `aria-invalid` and `role="alert"`. A
caller *cannot* forget to connect them. The most common form accessibility
failure is an error a screen-reader user never hears.

**Tabs use roving tabindex and manual activation.** Styled buttons in a row cost
one Tab press per tab to get past, and announce no relationship to their panel.
Manual activation matters too: automatic activation would load every panel while
arrowing to the last one, which for Toothlogy could mean several API requests.

**Dialog uses the native `<dialog>` element.** Focus trapping, Escape to close,
inert background content and top-layer rendering come from the platform,
correctly. Focus *restoration* is added by hand, because browsers do not
guarantee it.

**Tables scroll inside their own container**, which is focusable. A wide table
must not make the page scroll sideways on mobile, and a scroll area reachable
only by mouse hides its off-screen columns from keyboard users entirely.

**Reduced motion is honoured.** Skeleton shimmer becomes a static block; spinners
slow down. Vestibular disorders make large motion painful, not merely
distracting.

**Zoom is never capped.** `maximumScale` is deliberately unset — capping zoom
locks out users who need to magnify text (WCAG 1.4.4).

---

## 5. RTL

Layout uses **logical properties** throughout — `padding-inline`,
`margin-block-start`, `inset-inline-start`, `text-align: start` — never
left/right.

An RTL language therefore mirrors from the `dir` attribute alone, with no
separate stylesheet and no per-component work. Arabic and Urdu are kept in the
language registry from day one specifically so this stays exercised rather than
theoretical.

---

## 6. Components

| ID | Component | ARIA pattern |
|---|---|---|
| `TL-CMP-BUTTON-001` | Button | button |
| `TL-CMP-FIELD-001` | Field | — |
| `TL-CMP-INPUT-001` | Input | — |
| `TL-CMP-CARD-001` | Card | — (named region when labelled) |
| `TL-CMP-BADGE-001` | Badge | — |
| `TL-CMP-ALERT-001` | Alert | alert / status |
| `TL-CMP-DIALOG-001` | Dialog | dialog (modal) |
| `TL-CMP-TABLE-001` | Table | table |
| `TL-CMP-TABS-001` | Tabs | tabs (manual activation) |
| `TL-CMP-SKELETON-001` | Skeleton | — (aria-hidden) |
| `TL-CMP-SPINNER-001` | Spinner | status |
| `TL-CMP-STATE-001` | Empty / Loading / Error states | — |
| `TL-CMP-THEMETOGGLE-001` | ThemeToggle | radiogroup |
| `TL-CMP-ICON-001` | Icon | — (aria-hidden unless titled) |
| `TL-CMP-LOGO-001` | Logo | — (img when standing alone) |
| `TL-CMP-REVEAL-001` | Reveal | — |
| `TL-CMP-COUNTER-001` | Counter | — (final value exposed, steps hidden) |

All ✅ IMPLEMENTED, covered by 33 accessibility tests.

### State components are primitives on purpose

`EmptyState`, `LoadingState` and `ErrorState` are first-class components because
EMPTY, LOADING and ERROR states are three of the 21 certification dimensions
(Constitution §7).

Making them primitives changes what "done" means for every future screen: a
developer building a dentist list reaches for `EmptyState` and is immediately
confronted with the questions it requires — what should this say, and what
should the user do next? Left to per-screen improvisation, the empty case
renders as a blank panel and ships that way.

`ErrorState` takes a `requestId` for the same reason: it turns "it broke" into
an exact log line.

---

## 7. Prime

Prime will have a premium visual identity. It must remain **compatible with the
global design system**, which under this architecture means: Prime is a token
override, not a component fork.

Concretely — a `[data-brand="prime"]` scope redefining brand, surface and
elevation tokens. No Prime-specific `PrimeButton`. The moment Prime forks a
component, every accessibility fix has to be made twice, and the second one will
eventually be forgotten.

---

## 8. Not yet built

🔴 Deferred:

| Gap | Phase |
|---|---|
| Navigation shell, header, footer, breadcrumbs | 2 |
| Select, combobox, date picker, file upload | 2 |
| Toast / notification centre | 2 |
| Data table with sort, filter, column control | 3 |
| Automated contrast verification in CI | 2 |
| Visual regression | 2 |
| Icon system | 2 |
| Prime token overlay | 10 |
