import 'server-only';

/**
 * Who can see /admin/* pages. No admin-role column in the DB — this is a
 * small allowlist of verified sign-in emails. Set ADMIN_EMAILS (comma-
 * separated) in the environment to override; the owner address is the
 * built-in default so the page works before that env var is set.
 */
const DEFAULT_ADMIN_EMAILS = ['teamgoutham@gmail.com'];

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return DEFAULT_ADMIN_EMAILS;
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
