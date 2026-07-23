import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabase } from '@/lib/__mocks__/supabase';

// Lazy init — see lib/drivers/actions.test.ts for why the bag is hoisted.
const mockBag = vi.hoisted(() => ({ current: null as any }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({
    createAdminClient: () => mockBag.current.client,
}));
vi.mock('@/lib/auth', () => ({
    getUser: vi.fn(async () => ({ id: 'test-user-id' })),
    requireSuperAdminOrError: vi.fn(async () => ({ ok: true })),
}));

import { submitDesignRequest } from './actions';
import { DEFAULT_PARAMS } from '@/app/(portal)/admin/visualiser/store';

let emailCounter = 0;

/** Unique email per call so the per-email rate limiter never trips a test. */
function nextEmail() {
    emailCounter += 1;
    return `customer${emailCounter}@example.com`;
}

function setup(reference = 'DSR-2026-000001') {
    mockBag.current = createMockSupabase({
        tables: {
            design_requests: {
                insert: { data: { reference }, error: null },
            },
        },
    });
}

function validInput(patch: Record<string, unknown> = {}) {
    return {
        customerName: 'Ada Lovelace',
        customerEmail: nextEmail(),
        customerPhone: '',
        company: '',
        postcode: '',
        projectNotes: '',
        signType: 'Folded aluminium panel',
        params: { ...DEFAULT_PARAMS },
        svgSource: null,
        thumbnail: null,
        companyWebsite: '',
        ...patch,
    };
}

beforeEach(() => {
    setup();
});

describe('submitDesignRequest', () => {
    it('inserts the lead and returns the DSR reference', async () => {
        const res = await submitDesignRequest(validInput());
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.reference).toBe('DSR-2026-000001');
        expect(mockBag.current.calls.from).toContain('design_requests');
        expect(mockBag.current.calls.insert).toHaveLength(1);
        expect(mockBag.current.calls.insert[0]).toMatchObject({
            customer_name: 'Ada Lovelace',
            sign_type: 'Folded aluminium panel',
        });
    });

    it('rejects an invalid email without touching the database', async () => {
        const res = await submitDesignRequest(
            validInput({ customerEmail: 'not-an-email' }),
        );
        expect(res.ok).toBe(false);
        expect(mockBag.current.calls.insert).toHaveLength(0);
    });

    it('a filled honeypot still records the lead, flagged for triage', async () => {
        // Browser autofill can fill the hidden field on a real customer's
        // machine — silently dropping the enquiry loses real business, so a
        // hit must flag, not discard.
        const res = await submitDesignRequest(
            validInput({
                companyWebsite: 'https://autofilled.example.com',
                projectNotes: 'Need it by June.',
            }),
        );
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.reference).toBe('DSR-2026-000001');
        expect(mockBag.current.calls.insert).toHaveLength(1);
        const row = mockBag.current.calls.insert[0] as {
            project_notes: string;
        };
        expect(row.project_notes).toContain('Need it by June.');
        expect(row.project_notes).toContain('possible bot');
    });

    it('drops an oversize thumbnail rather than rejecting the whole lead', async () => {
        const res = await submitDesignRequest(
            validInput({ thumbnail: 'x'.repeat(4_000_001) }),
        );
        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.insert).toHaveLength(1);
        expect(
            (mockBag.current.calls.insert[0] as { thumbnail: unknown })
                .thumbnail,
        ).toBeNull();
    });

    it('drops an oversize flattened SVG rather than rejecting the whole lead', async () => {
        const res = await submitDesignRequest(
            validInput({ svgSource: 's'.repeat(5_000_001) }),
        );
        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.insert).toHaveLength(1);
        expect(
            (mockBag.current.calls.insert[0] as { svg_source: unknown })
                .svg_source,
        ).toBeNull();
    });

    it('keeps a thumbnail that is within the cap', async () => {
        const res = await submitDesignRequest(
            validInput({ thumbnail: 'data:image/jpeg;base64,abc' }),
        );
        expect(res.ok).toBe(true);
        expect(
            (mockBag.current.calls.insert[0] as { thumbnail: unknown })
                .thumbnail,
        ).toBe('data:image/jpeg;base64,abc');
    });

    it('surfaces a human-readable error when the insert fails', async () => {
        mockBag.current = createMockSupabase({
            tables: {
                design_requests: {
                    insert: {
                        data: null,
                        error: { message: 'duplicate key value' },
                    },
                },
            },
        });
        const res = await submitDesignRequest(validInput());
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain('hello@onesignanddigital.com');
            expect(res.error).not.toContain('duplicate key');
        }
    });
});
