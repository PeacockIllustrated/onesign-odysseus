/**
 * Web Worker wrapper around the nesting engine.
 *
 * The engine itself is a synchronous generator (engine.ts); this worker
 * drives it one iteration at a time, relaying improvements + progress to
 * the page and yielding to the macrotask queue between iterations so a
 * 'stop' message can land mid-run. All payloads are plain data
 * (structured-clone safe types from types.ts).
 */

import { runNest } from './engine';
import type { NestRequest, NestWorkerRequest, NestWorkerResponse } from './types';

const post = (msg: NestWorkerResponse) =>
    (self as unknown as { postMessage: (m: NestWorkerResponse) => void }).postMessage(
        msg,
    );

let stopRequested = false;
let running = false;

self.onmessage = (ev: MessageEvent<NestWorkerRequest>) => {
    const msg = ev.data;
    if (msg.type === 'stop') {
        stopRequested = true;
        return;
    }
    if (msg.type === 'nest' && !running) {
        running = true;
        stopRequested = false;
        void drive(msg);
    }
};

async function drive(req: NestRequest): Promise<void> {
    try {
        const gen = runNest(req.pieces, req.config, {
            iterations: req.iterations,
            seed: req.seed,
        });
        let it = gen.next();
        while (!it.done) {
            post(it.value);
            if (stopRequested) break;
            // Macrotask hop — lets a pending 'stop' message be handled.
            await new Promise((r) => setTimeout(r, 0));
            it = gen.next();
        }
        post({ type: 'done' });
    } catch (e) {
        post({
            type: 'error',
            message: e instanceof Error ? e.message : 'Nesting failed',
        });
    } finally {
        running = false;
    }
}
