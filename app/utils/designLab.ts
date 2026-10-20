/**
 * The design-lab routes: local-only mockup and logo-exploration pages with no data dependency.
 *
 * Single source of truth on purpose. These paths are referenced twice — the `pages:extend` hook in
 * `nuxt.config.ts` strips them from production builds, and `app.vue` lets them bypass `checkAuth()`.
 * When those two lists drift, the cleanup silently changes the auth path, so they read from here.
 */
export const DESIGN_LAB_ROUTE_PREFIXES = ['/mockups', '/daily-spread', '/logo-options'] as const;

export function isDesignLabPath(path: string): boolean {
  return DESIGN_LAB_ROUTE_PREFIXES.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/** Pages anyone can read without signing in (the App Store links to them). Not stripped. */
export const PUBLIC_ROUTES = ['/privacy', '/support'] as const;

export function isPublicPath(path: string): boolean {
  return (PUBLIC_ROUTES as readonly string[]).includes(path.replace(/\/$/, ''));
}
