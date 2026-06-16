import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabase } from '@/lib/__mocks__/supabase';

// Lazy init — see lib/drivers/actions.test.ts for why the bag is hoisted.
const mockBag = vi.hoisted(() => ({ current: null as any }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({
    createServerClient: async () => mockBag.current.client,
}));
vi.mock('@/lib/supabase-admin', () => ({
    createAdminClient: () => mockBag.current.client,
}));
vi.mock('@/lib/auth', () => ({
    getUser: vi.fn(async () => ({ id: 'test-user-id' })),
    requireSuperAdminOrError: vi.fn(async () => ({ ok: true })),
}));
// Avoid the live Persimmon adapter (network/env) at import time.
vi.mock('./adapters/persimmon', () => ({
    fetchPersimmonOrders: vi.fn(async () => []),
    persimmonToDisplay: vi.fn(),
}));

import { convertExternalOrderToQuote } from './actions';
import { getUser } from '@/lib/auth';

// Plain UUID → resolveToTrackedId short-circuits without touching Supabase.
const ORDER_ID = '11111111-1111-1111-1111-111111111111';

function setup(
    order: Record<string, unknown>,
    opts?: { pricingSet?: unknown; quoteInsert?: unknown }
) {
    mockBag.current = createMockSupabase({
        tables: {
            external_orders: {
                select: { data: order, error: null },
                update: { data: null, error: null },
            },
            pricing_sets: {
                // Use `in` (not ??) so an explicit `null` means "no active set".
                select: { data: opts && 'pricingSet' in opts ? opts.pricingSet : { id: 'ps-1' }, error: null },
            },
            quotes: {
                insert: { data: opts && 'quoteInsert' in opts ? opts.quoteInsert : { id: 'q-1' }, error: null },
            },
        },
    });
}

beforeEach(() => {
    vi.mocked(getUser).mockResolvedValue({ id: 'test-user-id' } as any);
});

describe('convertExternalOrderToQuote', () => {
    it('returns err when not authenticated', async () => {
        vi.mocked(getUser).mockResolvedValueOnce(null as any);
        setup({ linked_quote_id: null, status: 'acknowledged' });
        const res = await convertExternalOrderToQuote(ORDER_ID);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe('not authenticated');
    });

    it('is idempotent — returns the already-linked quote without creating a new one', async () => {
        setup({ linked_quote_id: 'q-existing', status: 'acknowledged' });
        const res = await convertExternalOrderToQuote(ORDER_ID);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.quoteId).toBe('q-existing');
        expect(mockBag.current.calls.insert.length).toBe(0);
    });

    it('refuses a completed order', async () => {
        setup({ linked_quote_id: null, status: 'completed' });
        const res = await convertExternalOrderToQuote(ORDER_ID);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/cannot convert/i);
    });

    it('errors when there is no active pricing set', async () => {
        setup({ linked_quote_id: null, status: 'acknowledged' }, { pricingSet: null });
        const res = await convertExternalOrderToQuote(ORDER_ID);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/pricing set/i);
    });

    it('creates a draft quote, links the order, and returns the quote id', async () => {
        setup({
            linked_quote_id: null,
            status: 'acknowledged',
            source_app: 'persimmon',
            external_ref: 'PSP-100',
            client_name: 'Acme Signs',
            client_email: 'a@acme.test',
            client_phone: null,
            linked_org_id: null,
            item_summary: '2x fascia',
            total_pence: 12300,
        });
        const res = await convertExternalOrderToQuote(ORDER_ID);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.quoteId).toBe('q-1');

        // Quote insert carries the active pricing set, draft status, and the
        // source order's client + reference.
        const quoteInsert = mockBag.current.calls.insert[0] as Record<string, unknown>;
        expect(quoteInsert).toMatchObject({
            pricing_set_id: 'ps-1',
            status: 'draft',
            customer_reference: 'PSP-100',
            customer_name: 'Acme Signs',
        });

        // Order flipped to converted + linked to the new quote.
        const orderUpdate = mockBag.current.calls.update[0] as Record<string, unknown>;
        expect(orderUpdate).toMatchObject({ status: 'converted', linked_quote_id: 'q-1' });
    });
});
