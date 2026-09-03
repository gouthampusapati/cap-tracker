'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const api = (url: string, method: string, body: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const TYPE_LABEL: Record<string, string> = {
  new_audit: 'New Single Audit filed',
  new_finding: 'New audit finding',
  repeat_finding: 'Repeat finding',
  deadline: 'Management-decision deadline',
};
function alertLine(a: { type: string; payload: Record<string, unknown> }) {
  const p = a.payload as Record<string, string>;
  let s = TYPE_LABEL[a.type] ?? a.type;
  if (a.type === 'new_audit' && p.auditYear) s += ` — FY ${p.auditYear}`;
  if ((a.type === 'new_finding' || a.type === 'repeat_finding') && p.referenceNumber)
    s += ` — ${p.referenceNumber}`;
  if (a.type === 'deadline' && p.deadline)
    s += ` — due ${p.deadline}${p.state === 'past' ? ' (past due)' : ''}`;
  return s;
}

export interface Group {
  id: string;
  name: string;
  monitored: boolean;
  items: { ein: string; label: string | null; checkedAt: string | null }[];
  alerts: { ein: string; type: string; payload: Record<string, unknown>; createdAt: string }[];
}

export function GroupCard({ group }: { group: Group }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState('');
  const [msg, setMsg] = useState('');

  const refresh = () => router.refresh();
  const wrap = async (fn: () => Promise<Response>) => {
    setBusy(true);
    setMsg('');
    const res = await fn();
    setBusy(false);
    if (res.ok) refresh();
    else {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error === 'monitored_cap' ? 'That would exceed the 100-organization monitoring cap.' : 'Something went wrong.');
    }
    return res.ok;
  };

  const alertsByEin = new Map<string, Group['alerts']>();
  for (const a of group.alerts) {
    if (!alertsByEin.has(a.ein)) alertsByEin.set(a.ein, []);
    alertsByEin.get(a.ein)!.push(a);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await wrap(() => api('/api/portfolio', 'PATCH', { id: group.id, name }))) setEditing(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                autoFocus
              />
              <button className="text-sm text-accent font-semibold" disabled={busy}>
                Save
              </button>
              <button type="button" className="text-sm text-gray-500" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <h2 className="text-lg font-bold text-gray-900">
              {group.name}{' '}
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-normal text-gray-400 hover:text-gray-700"
              >
                rename
              </button>
            </h2>
          )}
          <p className="text-xs text-gray-500">
            {group.items.length} organization{group.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={group.monitored}
              disabled={busy}
              onChange={(e) => wrap(() => api('/api/portfolio', 'PATCH', { id: group.id, monitored: e.target.checked }))}
            />
            Monitored
          </label>
          <button
            onClick={() => {
              if (confirm(`Delete "${group.name}"?`)) wrap(() => api('/api/portfolio', 'DELETE', { id: group.id }));
            }}
            className="text-sm text-gray-400 hover:text-red-600"
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-red-600 mt-2">{msg}</p>}

      <ul className="mt-3 divide-y divide-gray-100">
        {group.items.length === 0 && (
          <li className="py-2 text-sm text-gray-400">No organizations yet.</li>
        )}
        {group.items.map((it) => {
          const list = alertsByEin.get(it.ein) ?? [];
          const hasName = it.label && it.label !== it.ein;
          return (
            <li key={it.ein} className="py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/single-audit/${it.ein}`} className="text-sm font-semibold text-gray-900 hover:text-accent">
                    {hasName ? it.label : `EIN ${it.ein}`}
                  </Link>
                  {hasName && <span className="ml-2 text-xs text-gray-400 font-mono">{it.ein}</span>}
                </div>
                <button
                  onClick={() => wrap(() => api('/api/portfolio/items', 'DELETE', { id: group.id, ein: it.ein }))}
                  className="text-xs text-gray-400 hover:text-red-600"
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
              {list.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {list.slice(0, 5).map((a, i) => (
                    <li key={i} className="text-gray-600">
                      <span className="text-gray-400">
                        {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>{' '}
                      — {alertLine(a)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-gray-400">
                  {it.checkedAt
                    ? `No changes since ${new Date(it.checkedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`
                    : 'Not checked yet — first check runs with the next weekly sync.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {addOpen ? (
        <form
          className="mt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const eins = addValue.match(/\d{9}/g) ?? [];
            if (eins.length === 0) return;
            const res = await api('/api/portfolio/items', 'POST', { id: group.id, eins });
            if (res.ok) {
              const j = await res.json();
              setMsg(`Added ${j.added}${j.skipped ? `, ${j.skipped} already in the group` : ''}${j.capped ? `, ${j.capped} over the cap` : ''}.`);
              setAddValue('');
              setAddOpen(false);
              refresh();
            }
          }}
        >
          <textarea
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder={'916001236\n742089103'}
            rows={3}
            className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
          />
          <div className="flex gap-2 mt-1">
            <button className="text-sm bg-accent text-white font-semibold px-3 py-1 rounded">Add EINs</button>
            <button type="button" className="text-sm text-gray-500" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAddOpen(true)} className="mt-3 text-sm text-accent font-semibold hover:underline">
          + Add organizations
        </button>
      )}
    </div>
  );
}
