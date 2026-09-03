'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { track } from '@vercel/analytics';
import { EVENT_MONITOR_CTA_CLICK } from '@/lib/analytics-events';

interface Group {
  id: string;
  name: string;
  monitored: boolean;
  containsEin: boolean;
}

/**
 * "Add to Watchlist" on an org page — for a signed-in user with an
 * active monitor_access grant, a popover of their monitored groups (add
 * / remove this org, or make a new group). Everyone else gets a link to
 * sign-in or the founding form. Fires EVENT_MONITOR_CTA_CLICK (surface
 * only).
 */
export function MonitorOrgButton({
  ein,
  orgName,
  compact = false,
}: {
  ein: string;
  orgName?: string;
  compact?: boolean;
}) {
  const { status } = useSession();
  const [access, setAccess] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await fetch(`/api/portfolio?ein=${ein}`);
    if (r.status === 403) return setAccess('no');
    if (!r.ok) return;
    setAccess('yes');
    setGroups((await r.json()).portfolios);
  };

  useEffect(() => {
    if (status === 'authenticated') load();
  }, [status, ein]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const solid = compact
    ? 'bg-green-600 hover:bg-green-700 text-white font-semibold text-sm px-3 py-1.5 rounded whitespace-nowrap'
    : 'bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded';
  const outline = compact
    ? 'bg-white border border-green-600 text-green-800 hover:bg-green-50 font-semibold text-sm px-3 py-1.5 rounded whitespace-nowrap'
    : 'bg-white border border-green-600 text-green-800 hover:bg-green-50 font-semibold px-4 py-2 rounded';

  if (status === 'loading') {
    return (
      <span className={`inline-block opacity-60 ${solid}`} aria-hidden>
        Add to Watchlist
      </span>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Link
        href={`/auth/signin?next=${encodeURIComponent(`/single-audit/${ein}`)}`}
        onClick={() => track(EVENT_MONITOR_CTA_CLICK, { surface: 'org-page' })}
        className={`inline-block ${solid}`}
      >
        Add to Watchlist
      </Link>
    );
  }
  if (access === 'no') {
    return (
      <div>
        <Link
          href="/pricing#founding-form"
          onClick={() => track(EVENT_MONITOR_CTA_CLICK, { surface: 'org-page' })}
          className={`inline-block ${solid}`}
        >
          Add to Watchlist
        </Link>
        {!compact && (
          <p className="text-xs text-green-800 mt-2">
            Continuous monitoring is a founding-customer feature.
          </p>
        )}
      </div>
    );
  }

  const inCount = groups?.filter((g) => g.containsEin).length ?? 0;

  const toggle = async (g: Group) => {
    setBusy(true);
    const method = g.containsEin ? 'DELETE' : 'POST';
    const url = '/api/portfolio/items';
    const body = g.containsEin
      ? { id: g.id, ein }
      : { id: g.id, items: [{ ein, label: orgName }] };
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) {
      track(EVENT_MONITOR_CTA_CLICK, { surface: 'org-page' });
      load();
    }
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const r = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName, eins: [ein] }),
    });
    setBusy(false);
    if (r.ok) {
      setNewName('');
      track(EVENT_MONITOR_CTA_CLICK, { surface: 'org-page' });
      load();
    }
  };

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 ${inCount > 0 ? outline : solid}`}
      >
        {inCount > 0 ? `✓ In ${inCount} group${inCount === 1 ? '' : 's'}` : 'Add to Watchlist'}
        <span className="text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-left">
          {groups && groups.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto">
              {groups.map((g) => (
                <li key={g.id}>
                  <label className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={g.containsEin}
                      disabled={busy}
                      onChange={() => toggle(g)}
                    />
                    <span className="truncate">{g.name}</span>
                    {!g.monitored && <span className="text-xs text-gray-400">(paused)</span>}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1.5 text-sm text-gray-500">No groups yet.</p>
          )}

          <div className="border-t border-gray-100 mt-1 pt-2 flex items-center gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              placeholder="New group…"
              className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-sm"
            />
            <button
              onClick={createGroup}
              disabled={busy || !newName.trim()}
              className="text-sm text-accent font-semibold disabled:opacity-40"
            >
              Add
            </button>
          </div>

          <Link
            href="/portfolio/watchlist"
            className="block px-2 py-1.5 mt-1 text-xs text-accent font-semibold hover:underline"
          >
            Manage monitored portfolios →
          </Link>
        </div>
      )}
    </div>
  );
}
