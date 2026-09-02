/**
 * Pure diff core for the incremental FAC mirror sync.
 *
 * Given a per-report content digest computed from this week's CSVs and
 * the digests stored on the live mirror, decide which reports are new,
 * changed, or gone — so the sync only writes the ~0.5–1K reports that
 * actually moved instead of re-loading all ~414K every week.
 */

/**
 * @param {Map<string,string>} incoming  report_id -> this week's digest
 * @param {Map<string,string>} live      report_id -> stored digest (fac_mirror_general.content_hash)
 * @returns {{ changed: Set<string>, removed: Set<string>, unchanged: number }}
 *   changed  = new report_ids + report_ids whose digest differs (reload these)
 *   removed  = report_ids on the mirror but absent from this week's CSV (delete these)
 */
export function diffReports(incoming, live) {
  const changed = new Set();
  let unchanged = 0;
  for (const [id, digest] of incoming) {
    if (live.get(id) === digest) unchanged++;
    else changed.add(id);
  }
  const removed = new Set();
  for (const id of live.keys()) {
    if (!incoming.has(id)) removed.add(id);
  }
  return { changed, removed, unchanged };
}

/**
 * Safety gate against a truncated / malformed download silently
 * deleting most of the mirror. Curl `--fail -C -` already gives us a
 * complete file or a hard error, so this is defence in depth.
 *
 * @throws if the delete set is implausibly large, or the incoming set
 *   collapsed vs the live set.
 */
export function assertDiffSane({ changed, removed, incomingCount, liveCount }, opts = {}) {
  const maxRemoveAbs = opts.maxRemoveAbs ?? 200;
  const maxRemoveFrac = opts.maxRemoveFrac ?? 0.02;
  const minIncomingFrac = opts.minIncomingFrac ?? 0.9;

  if (liveCount > 0 && incomingCount < liveCount * minIncomingFrac) {
    throw new Error(
      `incremental sync: incoming report count ${incomingCount} is < ${Math.round(
        minIncomingFrac * 100
      )}% of the ${liveCount} on the mirror — refusing to apply (download likely truncated). Re-run with --full if this is real.`
    );
  }

  const removeLimit = Math.max(maxRemoveAbs, Math.ceil(liveCount * maxRemoveFrac));
  if (removed.size > removeLimit) {
    throw new Error(
      `incremental sync: would delete ${removed.size} reports (limit ${removeLimit}) — refusing to apply. Re-run with --full if FAC really removed this many.`
    );
  }
  // changed is not gated: a legitimately large FAC re-publication (schema
  // change on their side, mass re-acceptance) shows up as many "changed"
  // and that's fine — it still only writes what changed.
  void changed;
}

/**
 * Generic key+hash delta for a small table we rebuild from the live
 * mirror each run (the derived tables: org_summary ~68K, auditor_firms
 * ~8K). Reads the whole current table, hashes each row, and returns just
 * the upserts/deletes — so a week with no material change writes ~0 rows
 * instead of 76K.
 *
 * @param {Array<{key:string, hash:string, row:any}>} incomingRows
 * @param {Map<string,string>} liveHashes  key -> row hash of the current table
 */
export function deltaByKey(incomingRows, liveHashes) {
  const upserts = [];
  const seen = new Set();
  for (const { key, hash, row } of incomingRows) {
    seen.add(key);
    if (liveHashes.get(key) !== hash) upserts.push(row);
  }
  const deleteKeys = [];
  for (const key of liveHashes.keys()) {
    if (!seen.has(key)) deleteKeys.push(key);
  }
  return { upserts, deleteKeys };
}
