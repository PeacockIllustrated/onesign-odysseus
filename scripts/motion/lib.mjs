// Shared helpers for the motion scripts: find Playwright and ffmpeg, open a piece ready for capture.
// Neither is a project dependency on purpose; the scripts are an occasional studio tool, not part of the app.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  try { return require('playwright'); } catch {}
  try { return require(execSync('npm root -g').toString().trim() + '/playwright'); } catch {}
  throw new Error('Playwright not found. Install it once with `npm i -g playwright` (Chromium must be available).');
}

export function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const bundled = '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
  return existsSync(bundled) ? bundled : 'ffmpeg';
}

// Minimal flag parser: --name value, --flag (boolean), positionals.
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true; else { out[k] = v; i++; }
  }
  return out;
}

// Open a motion piece at its native capture size. Every piece follows the same contract:
// window.renderFrame(realSeconds) draws one frame, window.DURATION is the real length,
// ?ui=0 hides the review bar, ?native=1 backs the canvas at exact pixels, ?portrait=1 is the 9:16 cut
// (pieces that are portrait-only ignore it), ?t= freezes on a time. `query` adds more params (e.g. style=neon).
export async function openPiece(file, { portrait = false, width, height, query = '' } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const vw = width ?? (portrait ? 1080 : 1920), vh = height ?? (portrait ? 1920 : 1080);
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = pathToFileURL(resolve(file)).href + '?ui=0&native=1&t=0' + (portrait ? '&portrait=1' : '') + (query ? '&' + query.replace(/^[?&]/, '') : '');
  await page.goto(url);
  await page.waitForFunction(() => typeof window.renderFrame === 'function' && typeof window.DURATION === 'number');
  const duration = await page.evaluate(() => window.DURATION);
  return { browser, page, errors, duration };
}
