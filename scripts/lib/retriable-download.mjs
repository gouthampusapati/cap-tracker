/**
 * Classifies a failure from streaming one of FAC's bulk CSVs: is it a
 * transient download problem worth retrying, or a real one that should
 * abort the sync?
 *
 * FAC's CDN occasionally drops a long transfer mid-stream — general.csv
 * alone is hundreds of MB. Before scripts/sync-fac-mirror.mjs moved to
 * stream.pipeline(), that surfaced as an unhandled socket 'error' that
 * killed the whole process; now it rejects cleanly and, if this returns
 * true, the download is retried from an empty table.
 *
 * Deliberately NOT retriable:
 *   - "expected column(s) missing from CSV header" — our own abort when
 *     FAC changes their export schema; retrying can't fix it.
 *   - HTTP 4xx — the file moved or is gone; retrying can't fix it.
 * Retriable: HTTP 5xx, and the socket/stream error codes undici and
 * node:stream raise when a connection is reset, times out, or closes
 * early.
 */
export function isRetriableDownloadError(err) {
  if (!err) return false;
  const message = err instanceof Error ? err.message : String(err);

  if (/expected column\(s\) missing from CSV header/.test(message)) return false;
  if (typeof err.httpStatus === 'number') return err.httpStatus >= 500;

  const RETRIABLE_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ERR_STREAM_PREMATURE_CLOSE',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ]);
  if (RETRIABLE_CODES.has(err.code) || RETRIABLE_CODES.has(err.cause?.code)) return true;

  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;

  // undici surfaces a dropped connection as TypeError('fetch failed' |
  // 'terminated'), with the underlying code on err.cause (checked above).
  if (err instanceof TypeError && /fetch failed|terminated|network/i.test(message)) return true;

  return false;
}
