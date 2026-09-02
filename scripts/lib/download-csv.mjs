/**
 * Download a (large) file to disk with resume + retry.
 *
 * FAC's bulk CSVs redirect to a presigned S3 URL and their CDN drops
 * long transfers over some connections. `curl -C -` resumes from the
 * byte it stopped at (re-following the FAC redirect for a fresh
 * presigned URL each attempt) instead of restarting hundreds of MB from
 * zero — and downloading to a file first decouples the fragile network
 * transfer from the slow row-by-row DB load that used to hold the same
 * HTTP connection open for the whole sync.
 *
 * Same invocation scripts/build-passthrough-summary.mjs already uses on
 * passthrough.csv (~530MB).
 */
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';

export async function downloadWithResume(url, dest, { attempts = 5, log = () => {} } = {}) {
  for (let i = 1; i <= attempts; i++) {
    const code = await new Promise((resolve) => {
      const p = spawn(
        'curl',
        [
          '-sSL',
          '--fail',
          '--retry', '5',
          '--retry-all-errors',
          '--retry-delay', '5',
          '-C', '-',
          '-o', dest,
          url,
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] }
      );
      p.on('close', resolve);
      p.on('error', () => resolve(-1));
    });
    if (code === 0) {
      const { size } = await stat(dest);
      if (size === 0) throw new Error(`downloaded ${url} but the file is empty`);
      return size;
    }
    if (i === attempts) break;
    const waitMs = 10_000 * i;
    log(`download attempt ${i}/${attempts} for ${url.split('/').pop()} exited ${code} — retrying in ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`could not download ${url} after ${attempts} attempts`);
}
