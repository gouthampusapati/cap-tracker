// Simple session-based auth for MVP
// Stores email in localStorage

// The 'storage' event only fires in OTHER tabs/windows, never the one
// that made the change — so app/header.tsx (which reads this identity
// independently of whichever page created it) has no way to notice a
// same-tab change without this. Concretely: DashboardInner's own effect
// calls getOrCreateUser() to silently create a guest identity on first
// visit, but Header's effect can run and read localStorage before that
// write happens, then never re-check since its pathname dependency
// hasn't changed — it would show the generic signed-out state forever
// instead of the guest-specific "save your workspace" prompt. Dispatched
// from both loginUser and logoutUser so sign-in and sign-out both notify.
const IDENTITY_CHANGED_EVENT = 'sai:identity-changed';

export const loginUser = (email: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user_email', email);
    window.dispatchEvent(new Event(IDENTITY_CHANGED_EVENT));
  }
};

export const logoutUser = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('user_email');
    window.dispatchEvent(new Event(IDENTITY_CHANGED_EVENT));
  }
};

/**
 * Subscribe to same-tab identity changes (see the event's own comment
 * above for why this exists instead of the native 'storage' event).
 * Returns an unsubscribe function for effect cleanup.
 */
export const onIdentityChanged = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(IDENTITY_CHANGED_EVENT, callback);
  return () => window.removeEventListener(IDENTITY_CHANGED_EVENT, callback);
};

export const getUser = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('user_email');
  }
  return null;
};

export const isAuthenticated = () => {
  return !!getUser();
};

// A guest identifier looks like an email (the `users` table's email
// column is NOT NULL + UNIQUE, and every query in app/dashboard/page.tsx
// and app/api/org, app/api/cap-items, app/api/findings is keyed on this
// string) but is generated, not typed. This is what lets the dashboard
// drop the sign-in step entirely — see getOrCreateUser below.
const GUEST_DOMAIN = '@anonymous.local';

export const isGuestUser = (email: string) => email.endsWith(GUEST_DOMAIN);

/**
 * Returns the current identity, silently creating one if none exists.
 * This is what the dashboard now calls instead of redirecting to
 * /auth/signin — a first-time visitor gets a working workspace with zero
 * typing. Known tradeoff: a guest identity lives only in this browser's
 * localStorage, so clearing site data or switching devices loses access
 * to that workspace (no email to type back in and reconnect to it,
 * unlike a real account). A visitor who wants that portability can still
 * go to /auth/signin directly and set a real email themselves — this
 * function is only what dashboard entry uses by default.
 */
export const getOrCreateUser = (): string => {
  if (typeof window === 'undefined') return '';
  const existing = getUser();
  if (existing) return existing;
  const anonId = `guest-${crypto.randomUUID().slice(0, 8)}${GUEST_DOMAIN}`;
  loginUser(anonId);
  return anonId;
};
