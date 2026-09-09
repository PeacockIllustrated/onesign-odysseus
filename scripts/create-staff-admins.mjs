/**
 * Create (or repair) the Onesign & Digital staff admin accounts.
 *
 * Odysseus is single-tenant and staff-only (CLAUDE.md §3): clients are records,
 * not users, so the only accounts that exist are ours. "Admin" here means the
 * PLATFORM role — `profiles.role = 'super_admin'` — which is what every
 * `requireAdmin()` / `isSuperAdmin()` gate in the app reads. It has nothing to
 * do with `org_members`; the portal layout lets a super-admin with no client
 * membership straight in, so these accounts deliberately join no org.
 *
 * Idempotent. Run it as often as you like:
 *   - account missing        → created, email pre-confirmed
 *   - account exists         → left alone (password untouched)
 *   - profile missing/wrong  → upserted to super_admin
 *
 * Creating an account also fires `trg_auto_create_personal_org`, which drops a
 * "<name>'s workspace" row into `organizations` / `organization_members` — the
 * LYNX tenancy (CLAUDE.md §2e), not Odysseus `orgs`. Harmless and true of every
 * account-creation path here; staff deliberately join no Odysseus client org,
 * and the portal layout lets a super-admin with no membership straight in.
 *
 * The six office accounts below were provisioned on 2026-09-09; this script is
 * how the next new starter gets one.
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; read from
 * ./.env.local when run from the repo root, or export them yourself):
 *
 *   STAFF_PASSWORD_TEMPLATE='{Name}@Example2026' npm run staff:admins
 *   … npm run staff:admins -- --dry-run          # show what would happen
 *   … npm run staff:admins -- --reset-passwords  # also reset EXISTING accounts
 *
 * STAFF_PASSWORD_TEMPLATE is the first-login password pattern and is required.
 * It is kept out of the repo on purpose — pass it on the command line.
 *
 * The service-role key bypasses RLS and can mint accounts — run this from a
 * trusted machine only, never in a browser or a public CI log.
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

// ── Roster ───────────────────────────────────────────────────────────────
// First name only, matching the existing office convention (tom@…).
const STAFF = ['David', 'Lucy', 'Adam', 'Chris', 'Michael', 'John'];
const EMAIL_DOMAIN = 'onesignanddigital.com';

// The first-login password pattern, supplied at RUN TIME and deliberately not
// stored here — a credential in the repo is a credential in everyone's clone,
// and this one is shared across the office. {Name} expands to the roster
// spelling above, {name} to lowercase, e.g. STAFF_PASSWORD_TEMPLATE='{Name}@Acme2026'.
// A pattern everyone can derive is a temporary, hand-it-over password: rotate
// it once people are in by re-running with --reset-passwords.
const PASSWORD_TEMPLATE = process.env.STAFF_PASSWORD_TEMPLATE;

const emailFor = (name) => `${name.toLowerCase()}@${EMAIL_DOMAIN}`;
const passwordFor = (name) =>
    PASSWORD_TEMPLATE.replaceAll('{Name}', name).replaceAll('{name}', name.toLowerCase());

// ── Environment ──────────────────────────────────────────────────────────

/** Minimal .env.local reader so the script runs straight from a checkout. Ambient env wins. */
function loadEnvFile(file = '.env.local') {
    if (!existsSync(file)) return;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || line.trimStart().startsWith('#')) continue;
        const [, key, raw] = match;
        if (process.env[key] !== undefined) continue;
        process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
    }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error(
        'Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Put them in .env.local (see .env.example) or export them before running.'
    );
    process.exit(1);
}

if (!PASSWORD_TEMPLATE || !/\{name\}/i.test(PASSWORD_TEMPLATE)) {
    console.error(
        'Set STAFF_PASSWORD_TEMPLATE to the first-login password pattern, including\n' +
        "a {Name} (or {name}) placeholder — e.g. STAFF_PASSWORD_TEMPLATE='{Name}@Acme2026'.\n" +
        'It is not stored in the repo on purpose. Pass it on the command line rather\n' +
        'than committing it to .env.local.'
    );
    process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const resetPasswords = process.argv.includes('--reset-passwords');

const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────

/** Every existing auth user, keyed by lowercased email. One pass, not one per name. */
async function loadUsersByEmail() {
    const byEmail = new Map();
    const perPage = 1000;
    for (let page = 1; ; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
        if (error) throw new Error(`Could not list existing users: ${error.message}`);
        for (const user of data.users) {
            if (user.email) byEmail.set(user.email.toLowerCase(), user);
        }
        if (data.users.length < perPage) return byEmail;
    }
}

/**
 * Make sure the profile row exists and carries the super_admin role.
 *
 * A `handle_new_user` trigger on auth.users already inserts the row, at the
 * column default role `project_manager` — so this is an upgrade, not just a
 * backstop. Upsert covers the case where the trigger is ever dropped.
 *
 * `profiles` has NO email column (id / full_name / role / avatar_url /
 * updated_at). The email lives on auth.users; writing one here fails the
 * whole upsert. An existing full_name is left as its owner set it.
 */
async function ensureSuperAdminProfile(user, name) {
    const { data: existing, error: readError } = await sb
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', user.id)
        .maybeSingle();

    if (readError) throw new Error(`Could not read profile: ${readError.message}`);
    if (existing?.role === 'super_admin') return 'already super_admin';

    if (dryRun) return existing ? `role ${existing.role} → super_admin` : 'profile would be created';

    const { error } = await sb.from('profiles').upsert({
        id: user.id,
        full_name: existing?.full_name || name,
        role: 'super_admin',
    });

    if (error) throw new Error(`Could not set super_admin role: ${error.message}`);
    return existing ? `role ${existing.role} → super_admin` : 'profile created, super_admin';
}

// ── Run ──────────────────────────────────────────────────────────────────

const existingUsers = await loadUsersByEmail();
const results = [];
let failures = 0;

for (const name of STAFF) {
    const email = emailFor(name);
    const password = passwordFor(name);

    try {
        let user = existingUsers.get(email);
        let account;

        if (!user) {
            if (dryRun) {
                results.push({ email, account: 'would be created', profile: 'would be super_admin' });
                continue;
            }
            const { data, error } = await sb.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // no inbox round-trip; they log in immediately
                user_metadata: { full_name: name },
            });
            if (error) throw new Error(`Could not create account: ${error.message}`);
            user = data.user;
            account = 'created';
        } else if (resetPasswords) {
            const { error } = await sb.auth.admin.updateUserById(user.id, {
                password,
                email_confirm: true,
            });
            if (error) throw new Error(`Could not reset password: ${error.message}`);
            account = 'password reset';
        } else {
            account = 'already exists';
        }

        const profile = await ensureSuperAdminProfile(user, name);
        results.push({ email, account, profile });
    } catch (err) {
        failures++;
        results.push({ email, account: 'FAILED', profile: err.message });
    }
}

// ── Report ───────────────────────────────────────────────────────────────

const width = Math.max(...results.map((r) => r.email.length));
console.log(dryRun ? '\nDRY RUN — nothing was written.\n' : '');
for (const { email, account, profile } of results) {
    console.log(`${email.padEnd(width)}  ${account.padEnd(16)}  ${profile}`);
}

console.log(
    `\n${results.length - failures}/${results.length} staff accounts in place.` +
    (failures ? ` ${failures} failed — see above.` : '')
);
console.log(
    'Passwords follow the STAFF_PASSWORD_TEMPLATE pattern you supplied.\n' +
    'Existing accounts keep their current password unless you pass --reset-passwords.'
);

process.exit(failures ? 1 : 0);
