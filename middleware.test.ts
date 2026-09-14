import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The middleware matcher, guarded.
 *
 * Next requires `config.matcher` to be a statically analysable literal, so the
 * pattern cannot be imported from a shared module and asserted directly — it
 * is read out of the source here instead. Worth the awkwardness: which paths
 * middleware touches is a security-relevant invariant (CLAUDE.md §3), and the
 * pattern is a negative lookahead over a dozen alternatives, which is exactly
 * the kind of thing that silently stops excluding something when edited.
 */
function matcherPattern(): string {
    const src = readFileSync(resolve(__dirname, 'middleware.ts'), 'utf8');
    const match = src.match(/matcher:\s*\[\s*'([^']+)'/);
    if (!match) throw new Error('could not find the matcher literal in middleware.ts');
    // The literal is a JS string in source, so its escapes are doubled.
    return match[1].replace(/\\\\/g, '\\');
}

const runsOn = (path: string) => new RegExp(`^${matcherPattern()}$`).test(path);

describe('middleware matcher', () => {
    it('refreshes the session on the authenticated surfaces', () => {
        for (const path of [
            '/',
            '/login',
            '/signup',
            '/dashboard',
            '/admin/schedule',
            '/admin/quotes',
            '/admin/design-requests',
            '/schedule/tv',
            '/backshop',
            '/shop-floor',
            '/fitting-board',
        ]) {
            expect(runsOn(path), path).toBe(true);
        }
    });

    /**
     * The invariant this file exists for. These surfaces are reached by people
     * with no Supabase session at all — a 64-hex token is the only
     * authorisation — so middleware must not run on them, and must never grow
     * a branch that could gate them.
     */
    it('stays off the tokenised and public surfaces (CLAUDE.md §3)', () => {
        for (const path of [
            '/sign-off/0123456789abcdef',
            '/delivery/0123456789abcdef',
            '/production-sign-off/0123456789abcdef',
            '/approve/artwork/0123456789abcdef',
            '/design',
        ]) {
            expect(runsOn(path), path).toBe(false);
        }
    });

    it('stays off the logout route, which clears the cookies itself', () => {
        expect(runsOn('/api/auth/logout')).toBe(false);
        // Other API routes still get a refresh.
        expect(runsOn('/api/leads')).toBe(true);
    });

    it('does not spend an auth round-trip on static files', () => {
        for (const path of [
            '/_next/static/chunks/main.js',
            '/_next/image',
            '/favicon.ico',
            '/icon.svg',
            '/Odysseus-Logo.svg',
            '/pdf.worker.min.mjs',
            '/fonts/gilroy.woff2',
        ]) {
            expect(runsOn(path), path).toBe(false);
        }
    });
});
