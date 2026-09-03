'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Create a group. `initialEins` is passed from a /portfolio?eins=… hand-off
 * ("Save these as a group"). */
export function NewGroup({ initialEins = [] }: { initialEins?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(initialEins.length > 0);
  const [name, setName] = useState(initialEins.length > 0 ? 'Imported from portfolio' : '');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-accent text-white font-semibold px-4 py-2 rounded hover:opacity-90"
      >
        + New group
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        const res = await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, eins: initialEins }),
        });
        setBusy(false);
        if (res.ok) {
          setOpen(false);
          router.replace('/portfolio/watchlist');
          router.refresh();
        }
      }}
      className="flex flex-wrap items-center gap-2 bg-white border border-gray-200 rounded-lg p-3"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (e.g. Subrecipients)"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 min-w-[12rem]"
        autoFocus
      />
      {initialEins.length > 0 && (
        <span className="text-xs text-gray-500">with {initialEins.length} organization{initialEins.length === 1 ? '' : 's'}</span>
      )}
      <button className="text-sm bg-accent text-white font-semibold px-3 py-1.5 rounded" disabled={busy}>
        Create
      </button>
      <button type="button" className="text-sm text-gray-500" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
