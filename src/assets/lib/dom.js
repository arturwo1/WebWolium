export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function on(el, event, handler, options) {
  if (!el) return () => { };
  el.addEventListener(event, handler, options);
  return () => el.removeEventListener(event, handler, options);
}

export function closest(el, selector) {
  return el?.closest?.(selector) ?? null;
}
