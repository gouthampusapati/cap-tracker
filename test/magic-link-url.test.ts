import { describe, it, expect } from 'vitest';
import { toConfirmUrl, callbackUrlFromFragment, EMAIL_CALLBACK_PATH } from '../lib/magic-link-url';

// A realistic Auth.js email-callback URL (send-token.js builds exactly
// this shape: <origin>/api/auth/callback/email?callbackUrl&token&email).
const original = (origin = 'https://www.singleauditintel.com') =>
  `${origin}${EMAIL_CALLBACK_PATH}?` +
  new URLSearchParams({
    callbackUrl: 'https://www.singleauditintel.com/single-audit/916001236/risk-assessment',
    token: 'abcdef0123456789abcdef0123456789',
    email: 'goutham@singleauditintelligence.com',
  }).toString();

describe('magic-link confirm-URL rewriting', () => {
  it('points the email at /auth/confirm with params in the fragment', () => {
    const confirm = toConfirmUrl(original());
    const u = new URL(confirm);
    expect(u.origin).toBe('https://www.singleauditintel.com');
    expect(u.pathname).toBe('/auth/confirm');
    expect(u.search).toBe(''); // nothing in the query — a scanner's GET carries nothing
    expect(u.hash.length).toBeGreaterThan(1);
  });

  it('round-trips token / email / callbackUrl through the fragment', () => {
    const confirm = toConfirmUrl(original());
    const fragment = new URL(confirm).hash; // includes leading '#'
    const rebuilt = callbackUrlFromFragment(fragment);

    expect(rebuilt.startsWith(`${EMAIL_CALLBACK_PATH}?`)).toBe(true);
    const got = new URLSearchParams(rebuilt.split('?')[1]);
    const want = new URL(original()).searchParams;
    expect(got.get('token')).toBe(want.get('token'));
    expect(got.get('email')).toBe(want.get('email'));
    expect(got.get('callbackUrl')).toBe(want.get('callbackUrl'));
  });

  it('accepts a fragment with or without the leading #', () => {
    const withHash = callbackUrlFromFragment('#token=t&email=a%40b.com');
    const without = callbackUrlFromFragment('token=t&email=a%40b.com');
    expect(withHash).toBe(without);
    expect(new URLSearchParams(without.split('?')[1]).get('email')).toBe('a@b.com');
  });

  it('preserves the origin so an apex-domain request still targets that host', () => {
    // Browsers re-attach the fragment across the apex->www 308, so this
    // just needs to not rewrite the host itself.
    expect(toConfirmUrl(original('https://singleauditintel.com'))).toMatch(
      /^https:\/\/singleauditintel\.com\/auth\/confirm#/
    );
  });
});
