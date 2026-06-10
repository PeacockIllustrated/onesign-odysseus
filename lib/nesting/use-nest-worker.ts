'use client';

/**
 * React hook that runs the nesting engine off the main thread.
 *
 * Primary path: a bundled Web Worker (nest.worker.ts). If the worker fails
 * to construct OR errors while loading (bundler quirk, exotic browser), we
 * degrade to driving the same generator on the main thread in ~40ms time
 * slices — janky but functional, and identical results either way.
 *
 * `stop()` keeps the best solution received so far; the engine state is
 * disposable so we simply terminate the worker.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { runNest } from './engine';
import type {
    NestConfig,
    NestPiece,
    NestSolution,
    NestWorkerResponse,
} from './types';

export interface NestRunState {
    running: boolean;
    iteration: number;
    totalIterations: number;
    solution: NestSolution | null;
    error: string | null;
}

const IDLE: NestRunState = {
    running: false,
    iteration: 0,
    totalIterations: 0,
    solution: null,
    error: null,
};

export function useNestWorker() {
    const workerRef = useRef<Worker | null>(null);
    const fallbackToken = useRef<{ stopped: boolean } | null>(null);
    const [state, setState] = useState<NestRunState>(IDLE);

    const cleanup = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
        if (fallbackToken.current) fallbackToken.current.stopped = true;
        fallbackToken.current = null;
    }, []);

    useEffect(() => cleanup, [cleanup]);

    const stop = useCallback(() => {
        cleanup();
        setState((s) => ({ ...s, running: false }));
    }, [cleanup]);

    const reset = useCallback(() => {
        cleanup();
        setState(IDLE);
    }, [cleanup]);

    const start = useCallback(
        (
            pieces: NestPiece[],
            config: NestConfig,
            iterations: number,
            seed: number,
        ) => {
            cleanup();
            setState({
                running: true,
                iteration: 0,
                totalIterations: iterations,
                solution: null,
                error: null,
            });

            const handle = (msg: NestWorkerResponse) => {
                if (msg.type === 'solution') {
                    setState((s) => ({ ...s, solution: msg.solution }));
                } else if (msg.type === 'progress') {
                    setState((s) => ({ ...s, iteration: msg.iteration }));
                } else if (msg.type === 'error') {
                    setState((s) => ({ ...s, running: false, error: msg.message }));
                } else if (msg.type === 'done') {
                    setState((s) => ({ ...s, running: false }));
                }
            };

            const runOnMainThread = () => {
                const token = { stopped: false };
                fallbackToken.current = token;
                const gen = runNest(pieces, config, { iterations, seed });
                const step = () => {
                    if (token.stopped) return;
                    const t0 = performance.now();
                    // ~40ms slices keep the page interactive-ish.
                    while (performance.now() - t0 < 40) {
                        const it = gen.next();
                        if (it.done) {
                            handle({ type: 'done' });
                            return;
                        }
                        handle(it.value as NestWorkerResponse);
                        if (token.stopped) return;
                    }
                    setTimeout(step, 0);
                };
                setTimeout(step, 0);
            };

            try {
                const worker = new Worker(
                    new URL('./nest.worker.ts', import.meta.url),
                    { type: 'module' },
                );
                workerRef.current = worker;
                let gotMessage = false;
                worker.onmessage = (ev: MessageEvent<NestWorkerResponse>) => {
                    gotMessage = true;
                    handle(ev.data);
                };
                worker.onerror = () => {
                    // Worker chunk failed to load/execute — fall back, but only
                    // if it never produced anything (else we'd double-run).
                    worker.terminate();
                    workerRef.current = null;
                    if (!gotMessage) runOnMainThread();
                    else setState((s) => ({ ...s, running: false }));
                };
                worker.postMessage({
                    type: 'nest',
                    pieces,
                    config,
                    iterations,
                    seed,
                });
            } catch {
                workerRef.current = null;
                runOnMainThread();
            }
        },
        [cleanup],
    );

    return { ...state, start, stop, reset };
}
