/**
 * Vendor the pdf.js worker into /public.
 *
 * The production-pack builder loads the worker from our own origin
 * (`GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`) so PDF uploads work
 * offline on shop tablets with no bundler-worker guesswork. pdf.js refuses to
 * run if the worker version differs from the bundled API version, so this copy
 * MUST track the installed pdfjs-dist. Running it on `postinstall` keeps the
 * vendored worker in lockstep with whatever version npm just installed.
 */
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const dest = resolve(root, 'public/pdf.worker.min.mjs');

try {
    if (!existsSync(src)) {
        // pdfjs-dist not installed yet (or layout changed) — don't fail the install.
        console.warn('[vendor-pdf-worker] source not found, skipping:', src);
        process.exit(0);
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log('[vendor-pdf-worker] copied pdf.worker.min.mjs -> public/');
} catch (err) {
    console.warn('[vendor-pdf-worker] non-fatal:', err?.message ?? err);
    process.exit(0);
}
