/**
 * Theme bootstrap script.
 *
 * Solves the flash of wrong theme: the server cannot know the visitor's stored
 * preference, so it renders the default. If the theme were applied only after
 * React hydrates, a dark-mode user would see a white page flash on every
 * navigation — jarring in general, and genuinely unpleasant for someone using
 * dark mode because of light sensitivity.
 *
 * It applies, before first paint:
 *   - `data-theme` from `tl-theme` (light | dark; absent = system)
 *   - `data-palette`, `data-contrast`, `data-motion` and the root font size from
 *     `tl-prefs` (a small JSON object written by the preferences page and by
 *     the account-preference sync for signed-in users)
 *
 * It also marks the document as script-enabled with a `tl-js` class. Scroll
 * reveal animations hide their content before revealing it, so that initial
 * hidden state must only ever be applied when the script that reveals it is
 * actually going to run — otherwise a visitor with JavaScript disabled gets a
 * blank page.
 *
 * Every value is checked against an allow-list before it touches the DOM: the
 * stored object is user-writable, and nothing read from it may become markup.
 *
 * It is deliberately tiny and dependency-free: it blocks rendering, so every
 * byte and every operation is on the critical path.
 */

export const THEME_SCRIPT = `(function(){var d=document.documentElement;d.classList.add('tl-js');try{var t=localStorage.getItem('tl-theme');if(t==='dark'||t==='light'){d.setAttribute('data-theme',t);}var p=JSON.parse(localStorage.getItem('tl-prefs')||'{}');if(['indigo','rose','amber','slate'].indexOf(p.palette)>-1){d.setAttribute('data-palette',p.palette);}if(p.contrast==='more'){d.setAttribute('data-contrast','more');}if(p.motion==='reduce'){d.setAttribute('data-motion','reduce');}var s=Number(p.textScale);if(s>=90&&s<=150&&s!==100){d.style.fontSize=s+'%';}}catch(e){}})();`;

/** The shape stored under `tl-prefs`. */
export interface StoredPresentation {
  readonly palette?: 'teal' | 'indigo' | 'rose' | 'amber' | 'slate';
  readonly contrast?: 'normal' | 'more';
  readonly motion?: 'normal' | 'reduce';
  readonly textScale?: number;
}

export const PREFS_STORAGE_KEY = 'tl-prefs';

/** Apply presentation preferences to the live document (client only). */
export function applyPresentation(prefs: StoredPresentation): void {
  const root = document.documentElement;
  const palette = prefs.palette && prefs.palette !== 'teal' ? prefs.palette : null;
  if (palette) root.setAttribute('data-palette', palette);
  else root.removeAttribute('data-palette');

  if (prefs.contrast === 'more') root.setAttribute('data-contrast', 'more');
  else root.removeAttribute('data-contrast');

  if (prefs.motion === 'reduce') root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');

  const scale = Number(prefs.textScale);
  root.style.fontSize = scale >= 90 && scale <= 150 && scale !== 100 ? `${scale}%` : '';
}

export function storePresentation(prefs: StoredPresentation): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: preferences apply for this page only.
  }
}
