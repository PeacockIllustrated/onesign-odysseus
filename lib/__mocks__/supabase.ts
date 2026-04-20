/**
 * Lightweight Supabase client mock factory for Vitest.
 *
 * Server actions hit Supabase through a fluent builder chain:
 *     supabase.from('x').select('*').eq(...).order(...).single()
 *
 * A proper mock needs to return a chainable object for every method in the
 * chain while resolving (awaitable) to `{ data, error }` at the end.
 *
 * Usage:
 *     import { createMockSupabase } from '@/lib/__mocks__/supabase';
 *
 *     const mock = createMockSupabase({
 *         tables: {
 *             drivers: {
 *                 insert: { data: { id: 'd-1' }, error: null },
 *                 update: { data: null, error: null },
 *             },
 *         },
 *     });
 *
 *     vi.mock('@/lib/supabase-admin', () => ({
 *         createAdminClient: () => mock.client,
 *     }));
 *
 *     // Inspect after the action runs:
 *     expect(mock.calls.from).toContain('drivers');
 *     expect(mock.calls.insert[0]).toMatchObject({ name: 'Ada' });
 */

type OpResult = { data: unknown; error: { message: string } | null };

type TableConfig = Partial<Record<'insert' | 'update' | 'delete' | 'select' | 'upsert', OpResult>>;

export interface MockConfig {
    tables?: Record<string, TableConfig>;
    rpc?: Record<string, OpResult>;
}

export interface MockCalls {
    from: string[];
    insert: unknown[];
    update: unknown[];
    delete: number;
    upsert: unknown[];
    rpc: Array<{ name: string; args: unknown }>;
    eqFilters: Array<{ column: string; value: unknown }>;
}

export function createMockSupabase(config: MockConfig = {}) {
    const calls: MockCalls = {
        from: [],
        insert: [],
        update: [],
        delete: 0,
        upsert: [],
        rpc: [],
        eqFilters: [],
    };

    function makeBuilder(table: string, op: keyof TableConfig) {
        const result: OpResult = config.tables?.[table]?.[op] ?? { data: null, error: null };

        const builder: any = {
            select: () => builder,
            eq: (column: string, value: unknown) => {
                calls.eqFilters.push({ column, value });
                return builder;
            },
            neq: () => builder,
            in: () => builder,
            is: () => builder,
            gt: () => builder,
            gte: () => builder,
            lt: () => builder,
            lte: () => builder,
            like: () => builder,
            ilike: () => builder,
            order: () => builder,
            limit: () => builder,
            range: () => builder,
            single: () => Promise.resolve(result),
            maybeSingle: () => Promise.resolve(result),
            then: (resolve: (v: OpResult) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(result).then(resolve, reject),
        };
        return builder;
    }

    const client = {
        from: (table: string) => {
            calls.from.push(table);
            const tableBuilder: any = {
                select: () => makeBuilder(table, 'select'),
                insert: (payload: unknown) => {
                    calls.insert.push(payload);
                    return makeBuilder(table, 'insert');
                },
                update: (payload: unknown) => {
                    calls.update.push(payload);
                    return makeBuilder(table, 'update');
                },
                upsert: (payload: unknown) => {
                    calls.upsert.push(payload);
                    return makeBuilder(table, 'upsert');
                },
                delete: () => {
                    calls.delete += 1;
                    return makeBuilder(table, 'delete');
                },
            };
            return tableBuilder;
        },
        rpc: (name: string, args: unknown) => {
            calls.rpc.push({ name, args });
            const result = config.rpc?.[name] ?? { data: null, error: null };
            return Promise.resolve(result);
        },
        auth: {
            getUser: () =>
                Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null }),
        },
    };

    return { client, calls };
}
