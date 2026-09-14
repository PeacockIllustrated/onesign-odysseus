import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session refresh, and NOTHING else.
 *
 * ## Why this file has to exist
 *
 * `@supabase/ssr` keeps the session in cookies, and Supabase ROTATES the
 * refresh token on every use: the old one is revoked the moment a new one is
 * issued. Next's App Router lets a Server Component read cookies but not write
 * them, so `lib/supabase-server.ts` swallows the write — which is the pattern
 * Supabase documents, but only "if you have middleware refreshing user
 * sessions". Without this file, every hour went:
 *
 *   1. a server-rendered page calls getUser(),
 *   2. the access token has expired, so the client refreshes it — rotating the
 *      refresh token and revoking the one the browser holds,
 *   3. the new session is handed to setAll(), the write throws, the catch eats
 *      it, and nobody stores it,
 *   4. the browser presents its now-revoked token and gets "Already Used",
 *   5. the local session is cleared and the user lands on /login.
 *
 * Middleware is the one place in the App Router that can both read the request
 * cookies and write cookies onto the response, so the refresh happens here,
 * once per request, before anything renders. The workshop TV was hit hardest
 * because its layout re-runs requireAuth() on every server render — every 60s
 * poll, every Realtime change, every wake from sleep.
 *
 * ## What it deliberately does NOT do
 *
 * This middleware grants nothing and gates nothing. It is NOT an authorization
 * check, and no access decision may ever be moved into it:
 *
 *  - **It cannot grant access.** It only renews a session that is already
 *    valid. There is no path here that mints a session for an anonymous
 *    visitor, and no branch that lets a request past anything.
 *  - **It never redirects.** Every gate stays exactly where it is — the portal
 *    layout's `getUserOrg()` / `isSuperAdmin()`, `requireAuth()` on the TV and
 *    backshop layouts, `requireSuperAdminOrError()` at the top of every
 *    mutating server action, and RLS underneath all of it. A request that was
 *    refused before is refused identically now.
 *  - **It holds no privilege.** It uses the ANON key, never the service role,
 *    so it can read and change nothing a signed-out visitor couldn't. It calls
 *    `getUser()` (which validates the JWT against the auth server) rather than
 *    `getSession()` (which would trust whatever the cookie claimed).
 *  - **It cannot take the site down.** A middleware that throws 500s every
 *    route, so the refresh is wrapped: if it fails, the request proceeds and
 *    the page-level gates decide, which is the behaviour we had before.
 *
 * The unauthenticated surfaces from CLAUDE.md §3 — /sign-off, /delivery,
 * /production-sign-off and the public /design studio — are excluded in the
 * matcher below. They carry no session to refresh, and keeping middleware off
 * them entirely means nothing here can ever start gating a tokenised link.
 */
export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // Nothing to refresh without config, and middleware is the wrong place to
    // fail a deploy loudly — lib/env.ts already does that on the server side.
    if (!url || !anonKey) return response;

    try {
        const supabase = createServerClient(url, anonKey, {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    // Both halves matter. The request copy is what the page
                    // render downstream will read; the response copy is what
                    // the browser stores. Writing only one of them reproduces
                    // the bug this file exists to fix, one layer along.
                    cookiesToSet.forEach(({ name, value }) => {
                        request.cookies.set(name, value);
                    });
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options);
                    });
                },
            },
        });

        // The whole job. Refreshes the token if it has expired and, through
        // setAll above, persists the rotated pair. The result is deliberately
        // ignored: who the user is, and what they may do, is decided by the
        // layouts and server actions, not here.
        await supabase.auth.getUser();
    } catch {
        // A refresh that fails leaves the request exactly as it arrived. The
        // page's own gate then sends them to /login if the session is really
        // gone — the same outcome as before this file existed, rather than a
        // 500 on every route in the app.
    }

    return response;
}

export const config = {
    /**
     * Everything except:
     *  - the unauth surfaces (§3): sign-off, delivery, production-sign-off,
     *    approve (the legacy redirect into sign-off) and the public design
     *    studio — no session to refresh, and nothing here should go near them,
     *  - /api/auth/*, where the logout handler writes the cookies that clear
     *    the session and must not race a refresh writing them back,
     *  - static assets and image requests, which carry no session worth
     *    renewing and would just add an auth round-trip per file.
     */
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|api/auth|sign-off|delivery|production-sign-off|approve|design|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|pdf|mjs|txt|xml)$).*)',
    ],
};
