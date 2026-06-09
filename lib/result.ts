/**
 * Discriminated-union return type for server actions.
 *
 *   Result<T> = { ok: true; data: T } | { ok: false; error: string }
 *
 * Callers narrow on `res.ok`:
 *   const res = await doThing();
 *   if (!res.ok) { setError(res.error); return; }
 *   // res.data is T here
 *
 * The legacy shape (`{ error: string }` on failure, arbitrary payload on success)
 * is still present in older action modules. New code must use Result<T>.
 * Existing callers that check `'error' in res` continue to work with the new
 * shape — failure still carries `error`, success does not — so migration can
 * proceed module by module without touching every call site at once.
 */
export type Result<T = null> =
    | { ok: true; data: T }
    | { ok: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const okVoid = (): Result<null> => ({ ok: true, data: null });

export const err = (error: string): Result<never> => ({ ok: false, error });

/** Narrow helper for consumers: throws on failure, returns data on success. */
export function unwrap<T>(res: Result<T>): T {
    if (!res.ok) throw new Error(res.error);
    return res.data;
}
