/**
 * Runtime environment validation.
 *
 * Validated at module load so a misconfigured deploy fails fast instead of
 * crashing on first request. Import this module from any server entry point
 * that touches Supabase, and from `lib/supabase-server.ts` / `supabase.ts` /
 * `supabase-admin.ts`.
 *
 * NOTE: We DO NOT throw on missing service-role key at import time — many
 * server components don't need it. The admin client itself throws at its
 * first call if the key is absent. Only the public Supabase URL / anon key
 * are hard-required.
 */

import { z } from 'zod';

// The `typeof window` guard lets this file be imported by isomorphic code
// without blowing up in the browser (where process.env isn't populated).
const isServer = typeof window === 'undefined';

const PublicEnvSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z
        .string({ error: 'NEXT_PUBLIC_SUPABASE_URL is required' })
        .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
        .string({ error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required' })
        .min(40, 'NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short to be valid'),
});

const ServerEnvSchema = PublicEnvSchema.extend({
    // Optional at import time; admin-client calls throw if missing.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(40).optional(),
});

function parseEnv(): z.infer<typeof ServerEnvSchema> {
    // Always parse with the server schema. On the client, the service-role
    // key field is simply undefined (it's optional), so the client still
    // validates via the public URL + anon key.
    const schema = isServer ? ServerEnvSchema : PublicEnvSchema;
    const result = schema.safeParse(process.env);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(
            `Environment validation failed.\n${issues}\n\n` +
                `See .env.example for the full list of required variables.`
        );
    }
    // Widen to server shape so callers can read SUPABASE_SERVICE_ROLE_KEY
    // without a type narrowing dance. On the client the field is undefined.
    return result.data as z.infer<typeof ServerEnvSchema>;
}

export const env = parseEnv();

export type Env = typeof env;
