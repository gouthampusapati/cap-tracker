'use client';

import { useEffect } from 'react';

/**
 * Deep-link support: if the URL arrives with a hash matching a finding's
 * id (e.g. #2024-001, set on each <details> in finding-card.tsx), open
 * that finding and scroll it into view. A grants manager sending a
 * colleague "look at 2024-001" needs to land on 2024-001, already open.
 *
 * Native <details> can't be reliably forced open via CSS alone across
 * browsers without breaking its ARIA expanded-state, so this is a small
 * client-side effect — renders nothing, degrades gracefully with JS
 * disabled (the finding is still in the server HTML, just not
 * auto-expanded; a reader can still Ctrl+F or a screen reader can still
 * navigate to it).
 */
export function HashExpand() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const el = document.getElementById(hash);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, []);

  return null;
}
