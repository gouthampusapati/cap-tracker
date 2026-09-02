import { describe, it, expect } from 'vitest';
import { isRetriableDownloadError } from '../scripts/lib/retriable-download.mjs';

describe('isRetriableDownloadError', () => {
  it('is false for nullish', () => {
    expect(isRetriableDownloadError(null)).toBe(false);
    expect(isRetriableDownloadError(undefined)).toBe(false);
  });

  it('does NOT retry our own schema-drift abort', () => {
    const err = new Error(
      'general.csv: expected column(s) missing from CSV header: auditee_email — FAC may have changed their export schema. Aborting rather than guessing.'
    );
    expect(isRetriableDownloadError(err)).toBe(false);
  });

  it('does NOT retry an HTTP 4xx', () => {
    const err = Object.assign(new Error('FAC bulk download for general.csv returned HTTP 404'), {
      httpStatus: 404,
    });
    expect(isRetriableDownloadError(err)).toBe(false);
  });

  it('retries an HTTP 5xx', () => {
    const err = Object.assign(new Error('... returned HTTP 503'), { httpStatus: 503 });
    expect(isRetriableDownloadError(err)).toBe(true);
  });

  it('retries a reset/closed socket', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'UND_ERR_SOCKET']) {
      expect(isRetriableDownloadError(Object.assign(new Error('boom'), { code }))).toBe(true);
    }
  });

  it('retries when the retriable code is on err.cause (undici wrapping)', () => {
    const err = new TypeError('fetch failed');
    // @ts-expect-error - test shape
    err.cause = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' });
    expect(isRetriableDownloadError(err)).toBe(true);
  });

  it('retries a bare undici "fetch failed" / "terminated" TypeError', () => {
    expect(isRetriableDownloadError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetriableDownloadError(new TypeError('terminated'))).toBe(true);
  });

  it('retries an AbortError / TimeoutError by name', () => {
    expect(isRetriableDownloadError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    expect(isRetriableDownloadError(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))).toBe(true);
  });

  it('is false for an unrelated programming error', () => {
    expect(isRetriableDownloadError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isRetriableDownloadError(new Error('some assertion failed'))).toBe(false);
  });
});
