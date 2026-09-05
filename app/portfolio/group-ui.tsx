'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const api = (url: string, method: string, body: unknown) =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (fn: () => Promise<Response>, onOk?: () => void) => {
    setBusy(true);
    setMsg('');
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      onOk?.();
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg(
        j.error === 'monitored_cap'
          ? 'That would exceed the 100-organization monitoring cap.'
          : j.error === 'name_required'
            ? 'Name required.'
            : j.error === 'portfolio_limit'
              ? "You've reached the 10-group limit for now. Delete a group to make room, or ask us to raise it."
              : 'Something went wrong.'
      );
    }
    return res.ok;
  };
  return { busy, msg, setMsg, run };
}

/** Group header: name (editable), Monitor toggle, delete. */
export function GroupHeader({
  id,
  name,
  monitored,
}: {
  id: string;
  name: string;
  monitored: boolean;
}) {
  const { busy, msg, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => api('/api/portfolio', 'PATCH', { id, name: value }))) setEditing(false);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
          <h3 className="text-xl font-bold text-gray-900 truncate">
            {name}{' '}
            <button
              onClick={() => setEditing(true)}
              className="align-middle text-xs font-normal text-gray-400 hover:text-gray-700"
            >
              rename
            </button>
          </h3>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
              monitored ? 'bg-green-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                monitored ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
          Monitor
          <input
            type="checkbox"
            className="sr-only"
            checked={monitored}
            disabled={busy}
            onChange={(e) => run(() => api('/api/portfolio', 'PATCH', { id, monitored: e.target.checked }))}
          />
        </label>
        <button
          onClick={() => {
            if (confirm(`Delete "${name}"?`)) run(() => api('/api/portfolio', 'DELETE', { id }));
          }}
          className="text-sm text-gray-400 hover:text-red-600"
          disabled={busy}
        >
          Delete
        </button>
      </div>

      {msg && <p className="w-full text-xs text-red-600">{msg}</p>}
    </div>
  );
}

/** Soft "add organizations to this group" input, below the table. */
export function AddOrgs({ id }: { id: string }) {
  const { busy, msg, setMsg, run } = useAction();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-accent font-semibold hover:underline"
      >
        + Add organizations to this group
      </button>
    );
  }
  return (
    <form
      className="mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const eins = value.match(/\d{9}/g) ?? [];
        if (eins.length === 0) return setMsg('Enter one or more 9-digit EINs.');
        const ok = await run(() => api('/api/portfolio/items', 'POST', { id, eins }));
        if (ok) {
          setValue('');
          setOpen(false);
        }
      }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={'916001236\n742089103'}
        rows={2}
        className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
      />
      <div className="flex gap-2 mt-1">
        <button className="text-sm bg-accent text-white font-semibold px-3 py-1 rounded" disabled={busy}>
          Add
        </button>
        <button type="button" className="text-sm text-gray-500" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {msg && <span className="text-xs text-red-600 self-center">{msg}</span>}
      </div>
    </form>
  );
}

/** Create a new group. `eins` prefills it (from a ?eins= "save these"). */
export function NewGroupButton({ eins = [], label }: { eins?: string[]; label?: string }) {
  const { busy, msg, run } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(eins.length ? 'Imported from lookup' : '');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          eins.length
            ? 'inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded'
            : 'text-sm bg-accent text-white font-semibold px-4 py-2 rounded hover:opacity-90'
        }
      >
        {label ?? '+ New group'}
      </button>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => api('/api/portfolio', 'POST', { name, eins }))) setOpen(false);
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
      {eins.length > 0 && (
        <span className="text-xs text-gray-500">
          with {eins.length} organization{eins.length === 1 ? '' : 's'}
        </span>
      )}
      <button className="text-sm bg-accent text-white font-semibold px-3 py-1.5 rounded" disabled={busy}>
        Create
      </button>
      <button type="button" className="text-sm text-gray-500" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {msg && <span className="w-full text-xs text-red-600">{msg}</span>}
    </form>
  );
}
