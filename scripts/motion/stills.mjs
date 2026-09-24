#!/usr/bin/env node
// Review stills: render a piece at chosen times and tile them into one contact sheet, so a whole beat can be
// judged in a single image. This is the everyday check while iterating; render.mjs is only for the final cut.
//
//   node scripts/motion/stills.mjs public/motion/bloom-sign-story.html --at 10.5,11.0,11.2,11.4 --out out/pm.png
//   node scripts/motion/stills.mjs public/motion/bloom-sign-story.html --at 29.6,30,30.3 --portrait --out out/panel-p.png
//
// Times are STORY seconds when the piece exposes realAt() (pieces with a time warp: slow motion, sped-up
// flights), otherwise real seconds. Add --real to force real seconds (to judge pacing as the viewer sees it).
// Options: --cols 3  --tile-width 640  --portrait  --real  --keep (also keep each frame as its own PNG)
// Prints the page's DURATION, any console errors, and whether one frame renders identically twice.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openPiece, ffmpegPath, parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const file = args._[0];
if (!file || !args.at || !args.out) { console.error('usage: stills.mjs <piece.html> --at t1,t2,... --out sheet.png [--portrait] [--real] [--cols 3] [--keep]'); process.exit(1); }
const portrait = !!args.portrait, times = String(args.at).split(',').map(Number);
const cols = +(args.cols || Math.min(times.length, portrait ? 6 : 3)), tileW = +(args['tile-width'] || (portrait ? 360 : 640));
const tileH = Math.round(tileW * (portrait ? 16 / 9 : 9 / 16));

const { browser, page, errors, duration } = await openPiece(file, { portrait });
const dir = join(dirname(args.out), '.stills-' + process.pid);
mkdirSync(dir, { recursive: true });
for (let i = 0; i < times.length; i++) {
  await page.evaluate(([t, real]) => window.renderFrame(!real && typeof realAt === 'function' ? realAt(t) : t), [times[i], !!args.real]);
  await page.locator('canvas').screenshot({ path: join(dir, `f_${String(i).padStart(3, '0')}.png`) });
}
const deterministic = await page.evaluate(t => {
  const c = document.querySelector('canvas');
  window.renderFrame(t); const a = c.toDataURL(); window.renderFrame(0); window.renderFrame(t); return a === c.toDataURL();
}, duration * 0.37);
await browser.close();

const rows = Math.ceil(times.length / cols);
execFileSync(ffmpegPath(), ['-loglevel', 'error', '-y', '-i', join(dir, 'f_%03d.png'),
  '-vf', `scale=${tileW}:${tileH},tile=${cols}x${rows}`, '-frames:v', '1', args.out]);
if (!args.keep) rmSync(dir, { recursive: true, force: true }); else console.log('frames kept in', dir);
console.log(`sheet ${args.out}  (${times.join(', ')})  DURATION ${duration.toFixed(2)}s  deterministic ${deterministic}  errors ${errors.length ? JSON.stringify(errors) : 'none'}`);
