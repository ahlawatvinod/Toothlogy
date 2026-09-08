/**
 * Theme bootstrap script.
 *
 * Solves the flash of wrong theme: the server cannot know the visitor's stored
 * preference, so it renders the default. If the theme were applied only after
 * React hydrates, a dark-mode user would see a white page flash on every
 * navigation — jarring in general, and genuinely unpleasant for someone using
 * dark mode because of light sensitivity.
 *
 * This runs synchronously in <head>, before first paint, and sets the attribute
 * the CSS already reacts to. It is inlined as a string because it must execute
 * before any bundle loads.
 *
 * It is deliberately tiny and dependency-free: it blocks rendering, so every
 * byte and every operation is on the critical path.
 */

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('tl-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
