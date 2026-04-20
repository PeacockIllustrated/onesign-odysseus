import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('@/lib/mapbox/client', () => ({
    geocodeAddress: vi.fn(async () => []),
}));

import { createDriver, updateDriver, toggleDriverActive } from './actions';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';

beforeEach(() => {
    mockBag.current = createMockSupabase({
        tables: {
            drivers: {
                insert: { data: { id: 'd-1' }, error: null },
                update: { data: null, error: null },
                select: { data: { is_active: true }, error: null },
            },
        },
    });
    vi.mocked(getUser).mockResolvedValue({ id: 'test-user-id' } as any);
    vi.mocked(requireSuperAdminOrError).mockResolvedValue({ ok: true } as any);
});

describe('createDriver', () => {
    it('returns Result.ok with inserted id on success', async () => {
        const res = await createDriver({ name: 'Ada', vehicle_type: 'van' });
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.data.id).toBe('d-1');
        expect(mockBag.current.calls.from).toContain('drivers');
        expect(mockBag.current.calls.insert[0]).toMatchObject({ name: 'Ada', vehicle_type: 'van' });
    });

    it('returns Result.err when user not authenticated', async () => {
        vi.mocked(getUser).mockResolvedValueOnce(null as any);
        const res = await createDriver({ name: 'Ada' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe('not authenticated');
    });

    it('returns Result.err when super-admin gate fails', async () => {
        vi.mocked(requireSuperAdminOrError).mockResolvedValueOnce({ ok: false, error: 'forbidden' } as any);
        const res = await createDriver({ name: 'Ada' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe('forbidden');
    });

    it('returns Result.err when Zod validation fails', async () => {
        const res = await createDriver({ name: '' } as any);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/name/i);
    });
});

describe('updateDriver', () => {
    it('returns Result.ok on success and issues an eq filter on id', async () => {
        const res = await updateDriver('d-1', { name: 'Grace' });
        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.update[0]).toMatchObject({ name: 'Grace' });
        expect(mockBag.current.calls.eqFilters).toContainEqual({ column: 'id', value: 'd-1' });
    });
});

describe('toggleDriverActive', () => {
    it('flips is_active based on current value', async () => {
        mockBag.current = createMockSupabase({
            tables: {
                drivers: {
                    select: { data: { is_active: true }, error: null },
                    update: { data: null, error: null },
                },
            },
        });
        const res = await toggleDriverActive('d-1');
        expect(res.ok).toBe(true);
        expect(mockBag.current.calls.update[0]).toMatchObject({ is_active: false });
    });

    it('returns Result.err when driver not found', async () => {
        mockBag.current = createMockSupabase({
            tables: {
                drivers: {
                    select: { data: null, error: null },
                },
            },
        });
        const res = await toggleDriverActive('missing');
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe('driver not found');
    });
});
