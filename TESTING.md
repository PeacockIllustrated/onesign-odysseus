# Testing — Onesign Odysseus

Onesign Odysseus uses **Vitest** for all automated tests. This document explains what gets tested and where, so nobody has to guess the pattern when adding new code.

## Run

```bash
npm test           # one-shot
npm run test:watch # watch mode
```

Vitest config lives in `vitest.config.ts`. The `@/` path alias mirrors `tsconfig.json`.

## The three test layers

### 1. Pure-function unit tests

**What:** Calculation engines, validators, utilities — anything that takes inputs and returns outputs without touching Supabase, the filesystem, or the network.

**Where:** Co-located next to the module under test.

**Examples:**
- `lib/quoter/engine/*.test.ts` — signage quoter fixtures (panel_letters_v1)
- `lib/quoter/generic-item.test.ts` — generic quote-item pricing
- `lib/artwork/variant-utils.test.ts` — visual-approval variant helpers
- `lib/deliveries/utils.test.ts`, `lib/production/utils.test.ts`, `lib/production/shop-floor-utils.test.ts`
- `lib/geo/*.test.ts`, `lib/planning/*.test.ts`

**When to add one:** Any time you write a function whose correctness is non-trivial and doesn't need a DB. The quoter fixtures are the gold-standard pattern — inputs and expected outputs in a table, looped with `describe.each` / `it.each`.

### 2. Schema tests

**What:** Zod schemas for server-action inputs. Cheap, fast, catches most "bad input" bugs before they hit Supabase.

**Examples:**
- `lib/artwork/actions.test.ts` — `CreateArtworkJobInputSchema` discriminated-union validation
- `lib/artwork/sub-item-actions.test.ts` — sub-item input schemas

**When to add one:** Whenever you add or change a Zod schema on a server-action input. Cover: valid happy path, missing required field, wrong type, discriminant mismatch.

### 3. Server-action tests with mocked Supabase

**What:** Server actions exercised against an in-memory Supabase mock. Verifies the *action's* logic — auth gate, validation, the right insert/update payload, the right return shape — without touching a live DB.

**How:** Use the mock factory in `lib/__mocks__/supabase.ts` plus `vi.mock` on the Supabase admin/server clients and `@/lib/auth`.

**Reference implementation:** `lib/drivers/actions.test.ts`. Copy the `vi.hoisted` / `vi.mock` scaffolding when writing a new one.

**Pattern:**

```ts
import { createMockSupabase } from '@/lib/__mocks__/supabase';

const mockBag = vi.hoisted(() => ({ current: createMockSupabase() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
    createAdminClient: () => mockBag.current.client,
}));
vi.mock('@/lib/auth', () => ({
    getUser: vi.fn(async () => ({ id: 'test-user-id' })),
    requireSuperAdminOrError: vi.fn(async () => ({ ok: true })),
}));

// import AFTER mocks
import { createThing } from './actions';

beforeEach(() => {
    mockBag.current = createMockSupabase({
        tables: { things: { insert: { data: { id: 't-1' }, error: null } } },
    });
});

it('returns Result.ok with the inserted id', async () => {
    const res = await createThing({ name: 'x' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe('t-1');
    expect(mockBag.current.calls.insert[0]).toMatchObject({ name: 'x' });
});
```

**What the mock does not cover:** RLS, triggers, constraints, CHECKs, RPC function bodies, FK cascades. Those are DB-side and need layer 4.

**When to add one:** New server action whose return type is `Result<T>` (see `lib/result.ts`). At minimum cover: happy path, unauthenticated, super-admin gate failure, Zod validation failure.

### 4. Live-Supabase smoke tests

**What:** End-to-end smoke covering real constraint / RLS / trigger behaviour on a disposable Supabase project.

**When:** Before large schema changes, or when a bug is suspected in DB wiring that mocks can't see (RLS mis-configured, FK missing, trigger not firing).

**Status:** A minimal CRUD smoke landed in commit `6a4c811`. Full integration suite is deferred — it needs a dedicated test Supabase project (see CLAUDE.md "Deferred"). Don't block feature work on this layer.

## Conventions

- **Test files end `.test.ts`** and sit next to the module under test.
- **Prefer layers 1 and 2** (pure / schema) for business logic — they stay green through refactors and run in milliseconds.
- **Use layer 3** (mocked Supabase) for the action-level contract: "given this input and this gate state, we call the right table with the right payload and return the right `Result`."
- **Reserve layer 4** (live Supabase) for things mocks genuinely can't answer.
- **No mocks of mocks.** If a test needs three layers of `vi.mock` to express its intent, the unit is doing too much — extract a pure helper and test that instead.

## Server-action return shape

All new server actions return `Result<T>` from `lib/result.ts`:

```ts
import { ok, okVoid, err, type Result } from '@/lib/result';

export async function doThing(input: Input): Promise<Result<{ id: string }>> {
    if (!valid) return err('bad input');
    return ok({ id: 'x-1' });
}
```

Callers narrow with `if (!res.ok)`:

```ts
const res = await doThing(input);
if (!res.ok) { setError(res.error); return; }
useData(res.data);
```

Legacy modules that still return `{ error } | { ...payload }` are being migrated incrementally. The Result shape is backwards-compatible with `'error' in res` narrowing for interim interop.

## Coverage baseline

Not enforced yet. Target for the next sprint: every module under `lib/` has at least a schema test (layer 2) or a mocked-action test (layer 3) for each exported server action.
