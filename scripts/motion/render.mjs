#!/usr/bin/env node
// Render a motion piece to an MP4 master, one exact frame at a time (the piece is a pure function of t,
// so this is lossless with respect to the animation: no dropped frames, no timing jitter).
//
//   node scripts/motion/render.mjs public/motion/bloom-sign-story.html --portrait --out out/bloom-mobile-master.mp4
//   node scripts/motion/render.mjs public/motion/bloom-sign-story.html --out out/bloom-desktop-master.mp4
//
// Options: --portrait (9:16, 1080×1920)  --fps 60  --crf 16  --from <real s>  --to <real s>
// A ~40s piece at 60fps is ~2,500 frames and takes ~15 minutes per orientation; run both in parallel.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openPiece, ffmpegPath, parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const file = args._[0];
if (!file || !args.out) { console.error('usage: render.mjs <piece.html> --out <file.mp4> [--portrait] [--fps 60] [--crf 16] [--from s] [--to s]'); process.exit(1); }
const fps = +(args.fps || 60), crf = String(args.crf || 16), portrait = !!args.portrait;

const { browser, page, errors, duration } = await openPiece(file, { portrait });
const from = +(args.from || 0), to = Math.min(duration, +(args.to || duration));
const first = Math.round(from * fps), last = Math.round(to * fps);   // last frame excluded: t = DURATION is t = 0 again
mkdirSync(dirname(args.out), { recursive: true });
const ff = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', args.out],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const t0 = Date.now();
for (let i = first; i < last; i++) {
  const url = await page.evaluate(t => { window.renderFrame(t); return document.querySelector('canvas').toDataURL('image/png'); }, i / fps);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if ((i - first) % 300 === 0) console.log(`${args.out}  ${i - first} / ${last - first}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
if (errors.length) console.warn('page errors:', errors);
console.log(`done ${args.out}  ${last - first} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
