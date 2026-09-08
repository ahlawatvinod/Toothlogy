/**
 * Conditional class-name join.
 *
 * Written here rather than pulled from a dependency: it is nine lines, and the
 * design system is the one place where an extra runtime dependency is hardest
 * to justify — it loads on every page for every user.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter((v): v is string | number => Boolean(v)).join(' ');
}
