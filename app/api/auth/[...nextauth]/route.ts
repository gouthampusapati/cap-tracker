import { handlers } from '@/auth';

// Standard Auth.js v5 route handler — every sign-in/callback/sign-out
// request (e.g. Google's redirect back to /api/auth/callback/google)
// goes through this one catch-all route. See ../../../../auth.ts for
// the actual provider/adapter config.
export const { GET, POST } = handlers;
