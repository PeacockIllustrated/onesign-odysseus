import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabase } from '@/lib/__mocks__/supabase';

// Lazy init — referencing createMockSupabase inside the hoisted factory
// triggers "Cannot access ... before initialization" because vi.hoisted
// runs before the top-level imports resolve.
const mockBag = vi.hoisted(() => ({ current: null as any }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase-server', () => ({
    createServerClient: async () => mockBag.current.client,
}));

vi.mock('@/lib/auth', () => ({
    getUser: vi.fn(async () => ({ id: 'test-user-id' })),
}));

import { updateRow, setPackPublished } from './actions';
import { getUser } from '@/lib/auth';
import { isOutstanding, formatArtwork, countRows, type JobPack } from './types';

const ROW = {
    id: 'r-1',
    code: 'B',
    name: null,
    size: '14100 × 850',
    artwork: [{ label: 'Sponsor', state: 'spec' }],
    position: 3,
    updated_at: '2026-09-07T00:00:00Z',
};

beforeEach(() => {
    mockBag.current = createMockSupabase({
        tables: {
            redbull_rows: { update: { data: ROW, error: null } },
            redbull_states: {
                select: {
                    data: [
                        { key: 'spec' },
                        { key: 'flat' },
                        { key: 'pending' },
                        { key: 'quote' },
                        { key: 'unquoted' },
                    ],
                    error: null,
                },
            },
            redbull_packs: { update: { data: { id: 'p-1' }, error: null } },
        },
    });
    vi.mocked(getUser).mockResolvedValue({ id: 'test-user-id' } as any);
});

describe('updateRow', () => {
    it('writes the artwork parts and stamps updated_by', async () => {
        const res = await updateRow('r-1', {
            artwork: [
                { label: 'Sponsor', state: 'spec' },
                { label: 'To confirm', state: 'pending' },
            ],
        });

        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.from).toContain('redbull_rows');
        expect(mockBag.current.calls.update[0]).toMatchObject({
            updated_by: 'test-user-id',
            artwork: [
                { label: 'Sponsor', state: 'spec' },
                { label: 'To confirm', state: 'pending' },
            ],
        });
    });

    it('rejects a state that is not in redbull_states', async () => {
        const res = await updateRow('r-1', {
            artwork: [{ label: 'Sponsor', state: 'invented' }],
        });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('not a known artwork state');
        // and nothing was written
        expect(mockBag.current.calls.update).toHaveLength(0);
    });

    it('rejects an empty artwork label', async () => {
        const res = await updateRow('r-1', { artwork: [{ label: '  ', state: 'spec' }] });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('label cannot be empty');
    });

    it('caps the number of artwork parts', async () => {
        const res = await updateRow('r-1', {
            artwork: Array.from({ length: 5 }, (_, i) => ({
                label: `p${i}`,
                state: 'spec',
            })),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain('at most four');
    });

    it('turns a blank name or size into null rather than an empty string', async () => {
        const res = await updateRow('r-1', { name: '', size: '' });
        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.update[0]).toMatchObject({ name: null, size: null });
    });

    it('refuses when nobody is signed in', async () => {
        vi.mocked(getUser).mockResolvedValue(null as any);
        const res = await updateRow('r-1', { code: 'B' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe('not authenticated');
    });
});

describe('setPackPublished', () => {
    it('sets the flag', async () => {
        const res = await setPackPublished({
            packId: '11111111-1111-4111-8111-111111111111',
            isPublished: false,
        });
        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.update[0]).toMatchObject({ is_published: false });
    });

    it('rejects a malformed pack id before touching the database', async () => {
        const res = await setPackPublished({ packId: 'nope', isPublished: true });
        expect(res.ok).toBe(false);
        expect(mockBag.current.calls.update).toHaveLength(0);
    });
});

describe('pack helpers', () => {
    it('counts a row as outstanding only when a part is pending', () => {
        expect(isOutstanding({ ...ROW, artwork: [{ label: 'X', state: 'spec' }] })).toBe(false);
        expect(
            isOutstanding({
                ...ROW,
                artwork: [
                    { label: 'Sponsor', state: 'spec' },
                    { label: 'To confirm', state: 'pending' },
                ],
            })
        ).toBe(true);
    });

    it('formats parts the way the printed sheet reads', () => {
        expect(formatArtwork([])).toBe('—');
        expect(
            formatArtwork([
                { label: 'Sponsor', state: 'spec' },
                { label: 'To confirm', state: 'pending' },
            ])
        ).toBe('Sponsor / To confirm');
    });

    it('totals rows across every sheet and panel', () => {
        const pack = {
            sheets: [
                {
                    panels: [
                        { rows: [ROW, { ...ROW, artwork: [{ label: 'x', state: 'pending' }] }] },
                        { rows: [{ ...ROW, artwork: [] }] },
                    ],
                },
                { panels: [] },
            ],
        } as unknown as JobPack;

        expect(countRows(pack)).toEqual({ total: 3, outstanding: 1 });
    });
});
