/**
 * Fast, stable row hashing for the incremental FAC mirror sync.
 *
 * Not cryptographic — this only answers "did this row's mirrored values
 * change since last week". FNV-1a over the field values joined by a
 * separator that can't appear in FAC's CSV data (\x1f, unit separator),
 * folded to a 128-bit hex string in two independent lanes so accidental
 * collisions are ~2^-128 rather than ~2^-32.
 */

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

function fnv1a64(str, seed) {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i) & 0xff);
    // charCodeAt can exceed a byte for non-latin1; mix the high byte too
    const hi = str.charCodeAt(i) >> 8;
    if (hi) h ^= BigInt(hi) << 8n;
    h = (h * PRIME) & MASK;
  }
  return h;
}

/** Hash an ordered list of field values to a 32-char hex string. */
export function hashRow(values) {
  const joined = values.map((v) => (v == null ? '\x00' : String(v))).join('\x1f');
  const a = fnv1a64(joined, OFFSET);
  const b = fnv1a64(joined, OFFSET ^ 0x9e3779b97f4a7c15n);
  return a.toString(16).padStart(16, '0') + b.toString(16).padStart(16, '0');
}

/**
 * Order-independent combiner for the per-report digest: XOR of the hex
 * digests of every row belonging to a report_id, across every source
 * table. Seeded per table name so an identical row appearing in two
 * tables doesn't cancel out, and so a row moving between tables changes
 * the digest.
 */
export function xorHex(accHex, rowHex) {
  // 128-bit XOR on the two 64-bit halves.
  const aHi = BigInt('0x' + accHex.slice(0, 16));
  const aLo = BigInt('0x' + accHex.slice(16));
  const bHi = BigInt('0x' + rowHex.slice(0, 16));
  const bLo = BigInt('0x' + rowHex.slice(16));
  return (
    (aHi ^ bHi).toString(16).padStart(16, '0') + (aLo ^ bLo).toString(16).padStart(16, '0')
  );
}

export const ZERO_DIGEST = '0'.repeat(32);

/** hashRow for a row, tagged with its table so cross-table moves register. */
export function taggedRowHash(tableKey, values) {
  return hashRow([tableKey, ...values]);
}
