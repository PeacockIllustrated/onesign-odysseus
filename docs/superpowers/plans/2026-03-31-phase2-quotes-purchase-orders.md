# Phase 2: Quoting Enhancements + Purchase Orders
**Date:** 2026-03-31
**Branch:** `feature/phase2-quotes-purchase-orders` (branch from `feature/phase1-production-job-board` or `master` once Phase 1 is merged)
**Milestone:** Phase 2 complete = purchase orders fully functional, quote PDFs improved

---

## Context

- 21 existing migrations + 2 Phase 1 migrations (024, 025) = 25 total
- Next migrations: 026, 027
- Zero purchase order infrastructure exists (no tables, no lib, no routes)
- Quote table is missing: `notes_client`, `customer_reference`, `project_name`
- Quote print template exists but has no `notes_client` / `project_name` / `customer_reference`
- Sidebar Sales group has: Quotes, Leads, Pricing — needs "Purchase Orders" added
- Test runner: `npx vitest run` — tests in `**/*.test.ts`

---

## Scope

| # | Task | Files |
|---|------|-------|
| 1 | Migration 026 — quote field additions | `supabase/migrations/026_quote_enhancements.sql` |
| 2 | Update Quote TypeScript type + actions | `lib/quoter/types.ts`, `lib/quoter/actions.ts` |
| 3 | Update QuoteHeaderEdit form | `app/(portal)/admin/quotes/[id]/QuoteHeaderEdit.tsx` |
| 4 | Enhance quote client print template | `app/(print)/admin/quotes/[id]/client/page.tsx` |
| 5 | Migration 027 — purchase orders tables | `supabase/migrations/027_create_purchase_orders.sql` |
| 6 | PO types + utils + tests | `lib/purchase-orders/types.ts`, `utils.ts`, `utils.test.ts` |
| 7 | PO queries | `lib/purchase-orders/queries.ts` |
| 8 | PO server actions | `lib/purchase-orders/actions.ts` |
| 9 | PO list page | `app/(portal)/admin/purchase-orders/page.tsx`, `PurchaseOrdersClient.tsx` |
| 10 | PO detail page | `app/(portal)/admin/purchase-orders/[id]/page.tsx`, `PurchaseOrderDetail.tsx` |
| 11 | PO print view | `app/(print)/admin/purchase-orders/[id]/page.tsx` |
| 12 | Sidebar + final verification | `app/(portal)/components/Sidebar.tsx`, build + tests |

---

## Task 1 — Migration 026: Quote field additions

**File:** `supabase/migrations/026_quote_enhancements.sql`

```sql
-- Migration 026: Quote enhancements
-- Adds client-facing notes, customer reference, and project name to quotes

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS notes_client      TEXT,
    ADD COLUMN IF NOT EXISTS customer_reference TEXT,
    ADD COLUMN IF NOT EXISTS project_name       TEXT;
```

**Apply:** Run in Supabase Studio → SQL Editor. No data migration needed (all nullable).

---

## Task 2 — Update Quote TypeScript type + actions

### `lib/quoter/types.ts`

Add three fields to the `Quote` interface (after `notes_internal`):

```typescript
export interface Quote {
    id: string;
    quote_number: string;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    status: QuoteStatus;
    pricing_set_id: string;
    notes_internal: string | null;
    notes_client: string | null;         // ← NEW
    customer_reference: string | null;   // ← NEW
    project_name: string | null;         // ← NEW
    valid_until: string | null;
    created_at: string;
    created_by: string | null;
    updated_at: string;
}
```

### `lib/quoter/actions.ts`

**Update `UpdateQuoteInput`** — add three optional fields:

```typescript
export interface UpdateQuoteInput {
    id: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    notes_internal?: string;
    notes_client?: string;           // ← NEW
    customer_reference?: string;     // ← NEW
    project_name?: string;           // ← NEW
}
```

**Update `updateQuoteAction`** — include new fields in the `.update()` call:

```typescript
const { error } = await supabase
    .from('quotes')
    .update({
        customer_name: input.customer_name,
        customer_email: input.customer_email,
        customer_phone: input.customer_phone,
        notes_internal: input.notes_internal,
        notes_client: input.notes_client,           // ← NEW
        customer_reference: input.customer_reference, // ← NEW
        project_name: input.project_name,           // ← NEW
    })
    .eq('id', input.id);
```

**Update `duplicateQuoteAction`** — copy new fields when inserting new quote:

```typescript
const { data: newQuote, error: createError } = await supabase
    .from('quotes')
    .insert({
        customer_name: original.customer_name,
        customer_email: original.customer_email,
        customer_phone: original.customer_phone,
        pricing_set_id: original.pricing_set_id,
        notes_internal: original.notes_internal ? `Copied from ${original.quote_number}: ${original.notes_internal}` : `Copied from ${original.quote_number}`,
        notes_client: original.notes_client,                 // ← NEW
        customer_reference: original.customer_reference,     // ← NEW
        project_name: original.project_name,                 // ← NEW
        status: 'draft',
        created_by: user.id,
        valid_until: validUntil.toISOString().split('T')[0],
    })
    ...
```

---

## Task 3 — Update QuoteHeaderEdit form

**File:** `app/(portal)/admin/quotes/[id]/QuoteHeaderEdit.tsx`

Replace the entire file. Key changes from the existing version:
- Add `notes_client`, `customer_reference`, `project_name` to `defaultValues`
- Add a second row of fields for `project_name` + `customer_reference`
- Add a `notes_client` textarea (labelled "Client Notes — visible on PDF")

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Edit2, X, Loader2, Save } from 'lucide-react';
import { updateQuoteAction } from '@/lib/quoter/actions';
import { Quote } from '@/lib/quoter/types';

interface QuoteHeaderEditProps {
    quote: Quote;
}

export function QuoteHeaderEdit({ quote }: QuoteHeaderEditProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { register, handleSubmit } = useForm({
        defaultValues: {
            customer_name: quote.customer_name || '',
            customer_email: quote.customer_email || '',
            customer_phone: quote.customer_phone || '',
            project_name: quote.project_name || '',
            customer_reference: quote.customer_reference || '',
            notes_internal: quote.notes_internal || '',
            notes_client: quote.notes_client || '',
        }
    });

    const onSubmit = async (data: any) => {
        setIsSaving(true);
        setError(null);
        try {
            const result = await updateQuoteAction({ id: quote.id, ...data });
            if ('error' in result) {
                setError(result.error);
            } else {
                setIsEditing(false);
                router.refresh();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update');
        } finally {
            setIsSaving(false);
        }
    };

    if (isEditing) {
        return (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200 mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-neutral-900">Edit Quote Details</h3>
                    <button type="button" onClick={() => setIsEditing(false)} className="text-neutral-500 hover:text-neutral-900">
                        <X size={16} />
                    </button>
                </div>

                {/* Row 1: Contact */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Name</label>
                        <input {...register('customer_name')} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Email</label>
                        <input type="email" {...register('customer_email')} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Phone</label>
                        <input {...register('customer_phone')} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                </div>

                {/* Row 2: Project fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Project Name</label>
                        <input {...register('project_name')} placeholder="e.g. HQ Signage Refresh" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Reference</label>
                        <input {...register('customer_reference')} placeholder="e.g. PO-12345 or their ref" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Client Notes <span className="normal-case text-neutral-400">(visible on PDF)</span></label>
                    <textarea {...register('notes_client')} rows={3} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" placeholder="Notes to include on the client-facing PDF..." />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Internal Notes <span className="normal-case text-neutral-400">(not on PDF)</span></label>
                    <textarea {...register('notes_internal')} rows={2} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" placeholder="Internal notes only..." />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50">
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save Changes
                    </button>
                </div>
            </form>
        );
    }

    return (
        <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-[var(--radius-sm)] transition-colors">
            <Edit2 size={12} />
            Edit Details
        </button>
    );
}
```

---

## Task 4 — Enhance quote client print template

**File:** `app/(print)/admin/quotes/[id]/client/page.tsx`

Changes from current version:
1. Show `project_name` in the header (below quote number)
2. Show `customer_reference` in the customer section ("Your Ref: ...")
3. Show `notes_client` section above Terms & Conditions (only if non-empty)
4. Update footer text to "Onesign & Digital" (fix capitalisation)

**Diff — header section** (replace existing `quote-info` div):

```tsx
<div className="quote-info">
    <div className="quote-number">{quoteData.quote_number}</div>
    {quoteData.project_name && (
        <div className="quote-date" style={{ marginTop: '2px', fontWeight: 500, color: '#333' }}>
            {quoteData.project_name}
        </div>
    )}
    <div className="quote-date">{formatDate(quoteData.created_at)}</div>
    {quoteData.valid_until && (
        <div className="quote-date" style={{ marginTop: '4px' }}>
            Valid until: {new Date(quoteData.valid_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
    )}
</div>
```

**Diff — customer section** (replace existing `customer-section` div):

```tsx
<div className="customer-section">
    <div className="section-title">Quote For</div>
    <div className="customer-name">{quoteData.customer_name || 'Customer'}</div>
    {(quoteData.customer_email || quoteData.customer_phone) && (
        <div className="customer-contact">
            {quoteData.customer_email}
            {quoteData.customer_email && quoteData.customer_phone && ' • '}
            {quoteData.customer_phone}
        </div>
    )}
    {quoteData.customer_reference && (
        <div className="customer-contact" style={{ marginTop: '4px' }}>
            Your ref: <strong>{quoteData.customer_reference}</strong>
        </div>
    )}
</div>
```

**Diff — add notes_client section** (insert before the existing `notes-section` div):

```tsx
{quoteData.notes_client && (
    <div className="notes-section">
        <div className="notes-title">Notes</div>
        <div className="notes-content" style={{ whiteSpace: 'pre-wrap', color: '#333' }}>
            {quoteData.notes_client}
        </div>
    </div>
)}
```

**Diff — footer** (update company name):

```tsx
<div className="footer">
    Onesign & Digital • Quote generated on {formatDate(new Date().toISOString())}
</div>
```

---

## Task 5 — Migration 027: Purchase Orders tables

**File:** `supabase/migrations/027_create_purchase_orders.sql`

```sql
-- Migration 027: Purchase Orders
-- Creates purchase_orders and po_items tables with PO-YYYY-NNNNNN sequence

-- =============================================================================
-- SEQUENCE
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

-- =============================================================================
-- TABLE: purchase_orders
-- =============================================================================

CREATE TABLE public.purchase_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number           TEXT NOT NULL UNIQUE DEFAULT '',
    org_id              UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    quote_id            UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    production_job_id   UUID REFERENCES public.production_jobs(id) ON DELETE SET NULL,
    supplier_name       TEXT NOT NULL,
    supplier_email      TEXT,
    supplier_reference  TEXT,
    description         TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'acknowledged', 'completed', 'cancelled')),
    issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    required_by_date    DATE,
    notes_internal      TEXT,
    notes_supplier      TEXT,
    total_pence         INTEGER NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate PO number on insert
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.po_number := 'PO-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('po_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_number
    BEFORE INSERT ON public.purchase_orders
    FOR EACH ROW
    WHEN (NEW.po_number = '')
    EXECUTE FUNCTION generate_po_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_purchase_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_purchase_orders_updated_at
    BEFORE UPDATE ON public.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION trg_purchase_orders_updated_at();

-- =============================================================================
-- TABLE: po_items
-- =============================================================================

CREATE TABLE public.po_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id            UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    description      TEXT NOT NULL,
    quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_cost_pence  INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_pence >= 0),
    line_total_pence INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;

-- Super admin: full access on purchase_orders
CREATE POLICY "Super admin full access on purchase_orders"
    ON public.purchase_orders FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Super admin: full access on po_items (via purchase_orders)
CREATE POLICY "Super admin full access on po_items"
    ON public.po_items FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po
            JOIN public.profiles p ON p.id = auth.uid()
            WHERE po.id = po_items.po_id AND p.role = 'super_admin'
        )
    );
```

**Apply:** Run in Supabase Studio → SQL Editor.

---

## Task 6 — PO types, utils, and tests

### `lib/purchase-orders/types.ts`

```typescript
export type PoStatus = 'draft' | 'sent' | 'acknowledged' | 'completed' | 'cancelled';

export interface PurchaseOrder {
    id: string;
    po_number: string;
    org_id: string;
    quote_id: string | null;
    production_job_id: string | null;
    supplier_name: string;
    supplier_email: string | null;
    supplier_reference: string | null;
    description: string;
    status: PoStatus;
    issue_date: string;
    required_by_date: string | null;
    notes_internal: string | null;
    notes_supplier: string | null;
    total_pence: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface PoItem {
    id: string;
    po_id: string;
    description: string;
    quantity: number;
    unit_cost_pence: number;
    line_total_pence: number;
    created_at: string;
}

export interface PoWithItems extends PurchaseOrder {
    items: PoItem[];
    linked_job: { id: string; job_number: string; title: string } | null;
    linked_quote: { id: string; quote_number: string; customer_name: string | null } | null;
}

export interface CreatePoInput {
    org_id: string;
    supplier_name: string;
    supplier_email?: string;
    description: string;
    required_by_date?: string;
    quote_id?: string;
    production_job_id?: string;
}

export interface UpdatePoInput {
    id: string;
    supplier_name?: string;
    supplier_email?: string;
    supplier_reference?: string;
    description?: string;
    required_by_date?: string;
    notes_internal?: string;
    notes_supplier?: string;
}

export interface CreatePoItemInput {
    po_id: string;
    description: string;
    quantity: number;
    unit_cost_pence: number;
}

export interface UpdatePoItemInput {
    id: string;
    po_id: string;
    description?: string;
    quantity?: number;
    unit_cost_pence?: number;
}
```

### `lib/purchase-orders/utils.ts`

```typescript
import type { PoStatus } from './types';

export function calcLineTotal(quantity: number, unitCostPence: number): number {
    return quantity * unitCostPence;
}

export function calcPoTotal(items: Array<{ line_total_pence: number }>): number {
    return items.reduce((sum, item) => sum + item.line_total_pence, 0);
}

export function formatPence(pence: number): string {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
    }).format(pence / 100);
}

export const PO_STATUS_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
    draft:        ['sent', 'cancelled'],
    sent:         ['acknowledged', 'cancelled'],
    acknowledged: ['completed', 'cancelled'],
    completed:    [],
    cancelled:    ['draft'],
};

export function canTransitionTo(current: PoStatus, next: PoStatus): boolean {
    return PO_STATUS_TRANSITIONS[current].includes(next);
}

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
    draft:        'Draft',
    sent:         'Sent',
    acknowledged: 'Acknowledged',
    completed:    'Completed',
    cancelled:    'Cancelled',
};

export const PO_STATUS_COLORS: Record<PoStatus, string> = {
    draft:        'text-neutral-600 bg-neutral-100',
    sent:         'text-blue-700 bg-blue-50',
    acknowledged: 'text-amber-700 bg-amber-50',
    completed:    'text-green-700 bg-green-50',
    cancelled:    'text-red-700 bg-red-50',
};
```

### `lib/purchase-orders/utils.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
    calcLineTotal,
    calcPoTotal,
    formatPence,
    canTransitionTo,
} from './utils';

describe('calcLineTotal', () => {
    it('multiplies quantity by unit cost', () => {
        expect(calcLineTotal(3, 5000)).toBe(15000);
    });
    it('returns 0 for zero quantity', () => {
        expect(calcLineTotal(0, 5000)).toBe(0);
    });
    it('returns 0 for zero unit cost', () => {
        expect(calcLineTotal(3, 0)).toBe(0);
    });
    it('handles single unit', () => {
        expect(calcLineTotal(1, 12345)).toBe(12345);
    });
});

describe('calcPoTotal', () => {
    it('sums all line totals', () => {
        expect(calcPoTotal([
            { line_total_pence: 10000 },
            { line_total_pence: 5000 },
            { line_total_pence: 2500 },
        ])).toBe(17500);
    });
    it('returns 0 for empty items', () => {
        expect(calcPoTotal([])).toBe(0);
    });
    it('handles single item', () => {
        expect(calcPoTotal([{ line_total_pence: 99999 }])).toBe(99999);
    });
});

describe('formatPence', () => {
    it('formats pence as GBP string', () => {
        expect(formatPence(15050)).toBe('£150.50');
    });
    it('formats zero', () => {
        expect(formatPence(0)).toBe('£0.00');
    });
    it('formats whole pounds', () => {
        expect(formatPence(100000)).toBe('£1,000.00');
    });
});

describe('canTransitionTo', () => {
    it('allows draft → sent', () => {
        expect(canTransitionTo('draft', 'sent')).toBe(true);
    });
    it('allows draft → cancelled', () => {
        expect(canTransitionTo('draft', 'cancelled')).toBe(true);
    });
    it('rejects draft → completed', () => {
        expect(canTransitionTo('draft', 'completed')).toBe(false);
    });
    it('allows sent → acknowledged', () => {
        expect(canTransitionTo('sent', 'acknowledged')).toBe(true);
    });
    it('allows sent → cancelled', () => {
        expect(canTransitionTo('sent', 'cancelled')).toBe(true);
    });
    it('allows acknowledged → completed', () => {
        expect(canTransitionTo('acknowledged', 'completed')).toBe(true);
    });
    it('allows cancelled → draft (reopen)', () => {
        expect(canTransitionTo('cancelled', 'draft')).toBe(true);
    });
    it('rejects completed → any', () => {
        expect(canTransitionTo('completed', 'draft')).toBe(false);
        expect(canTransitionTo('completed', 'cancelled')).toBe(false);
    });
});
```

**Run tests:** `npx vitest run lib/purchase-orders/utils.test.ts`
All 15 assertions should pass before proceeding.

---

## Task 7 — PO queries

**File:** `lib/purchase-orders/queries.ts`

```typescript
import { createServerClient } from '@/lib/supabase-server';
import type { PurchaseOrder, PoItem, PoWithItems } from './types';

export async function getPurchaseOrders(filters?: {
    status?: string;
    search?: string;
}): Promise<PurchaseOrder[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        const safe = filters.search.replace(/[,()]/g, '').trim();
        if (safe) {
            query = query.or(
                `po_number.ilike.%${safe}%,supplier_name.ilike.%${safe}%,description.ilike.%${safe}%`
            );
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching purchase orders:', error);
        return [];
    }
    return data as PurchaseOrder[];
}

export async function getPoWithItems(poId: string): Promise<PoWithItems | null> {
    const supabase = await createServerClient();

    const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', poId)
        .single();

    if (poError || !po) return null;

    const { data: items } = await supabase
        .from('po_items')
        .select('*')
        .eq('po_id', poId)
        .order('created_at', { ascending: true });

    let linked_job = null;
    if (po.production_job_id) {
        const { data: job } = await supabase
            .from('production_jobs')
            .select('id, job_number, title')
            .eq('id', po.production_job_id)
            .single();
        linked_job = job ?? null;
    }

    let linked_quote = null;
    if (po.quote_id) {
        const { data: quote } = await supabase
            .from('quotes')
            .select('id, quote_number, customer_name')
            .eq('id', po.quote_id)
            .single();
        linked_quote = quote ?? null;
    }

    return {
        ...(po as PurchaseOrder),
        items: (items || []) as PoItem[],
        linked_job,
        linked_quote,
    };
}
```

---

## Task 8 — PO server actions

**File:** `lib/purchase-orders/actions.ts`

```typescript
'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { calcLineTotal, calcPoTotal, canTransitionTo } from './utils';
import { getPurchaseOrders, getPoWithItems } from './queries';
import type {
    CreatePoInput,
    UpdatePoInput,
    CreatePoItemInput,
    UpdatePoItemInput,
    PoStatus,
    PurchaseOrder,
    PoWithItems,
} from './types';

// Thin wrappers for client components
export async function getPoListAction(filters?: {
    status?: string;
    search?: string;
}): Promise<PurchaseOrder[]> {
    return getPurchaseOrders(filters);
}

export async function getPoWithItemsAction(poId: string): Promise<PoWithItems | null> {
    return getPoWithItems(poId);
}

// Recalculate and persist po.total_pence from current items
async function recalcPoTotal(supabase: any, poId: string): Promise<void> {
    const { data: items } = await supabase
        .from('po_items')
        .select('line_total_pence')
        .eq('po_id', poId);
    const total = calcPoTotal(items || []);
    await supabase
        .from('purchase_orders')
        .update({ total_pence: total })
        .eq('id', poId);
}

export async function createPoAction(
    input: CreatePoInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('purchase_orders')
        .insert({
            org_id: input.org_id,
            supplier_name: input.supplier_name,
            supplier_email: input.supplier_email || null,
            description: input.description,
            required_by_date: input.required_by_date || null,
            quote_id: input.quote_id || null,
            production_job_id: input.production_job_id || null,
            status: 'draft',
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating PO:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/purchase-orders');
    return { id: data.id };
}

export async function updatePoAction(
    input: UpdatePoInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('purchase_orders')
        .update({
            supplier_name: input.supplier_name,
            supplier_email: input.supplier_email,
            supplier_reference: input.supplier_reference,
            description: input.description,
            required_by_date: input.required_by_date,
            notes_internal: input.notes_internal,
            notes_supplier: input.notes_supplier,
        })
        .eq('id', input.id);

    if (error) {
        console.error('Error updating PO:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/purchase-orders/${input.id}`);
    revalidatePath('/admin/purchase-orders');
    return { success: true };
}

export async function updatePoStatusAction(
    poId: string,
    newStatus: PoStatus
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: current, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', poId)
        .single();

    if (fetchError || !current) return { error: 'Purchase order not found' };

    if (!canTransitionTo(current.status as PoStatus, newStatus)) {
        return { error: `Cannot transition from "${current.status}" to "${newStatus}"` };
    }

    const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', poId);

    if (error) {
        console.error('Error updating PO status:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/purchase-orders/${poId}`);
    revalidatePath('/admin/purchase-orders');
    return { success: true };
}

export async function addPoItemAction(
    input: CreatePoItemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const lineTotal = calcLineTotal(input.quantity, input.unit_cost_pence);

    const { data, error } = await supabase
        .from('po_items')
        .insert({
            po_id: input.po_id,
            description: input.description,
            quantity: input.quantity,
            unit_cost_pence: input.unit_cost_pence,
            line_total_pence: lineTotal,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error adding PO item:', error);
        return { error: error.message };
    }

    await recalcPoTotal(supabase, input.po_id);
    revalidatePath(`/admin/purchase-orders/${input.po_id}`);
    return { id: data.id };
}

export async function updatePoItemAction(
    input: UpdatePoItemInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: current, error: fetchError } = await supabase
        .from('po_items')
        .select('quantity, unit_cost_pence')
        .eq('id', input.id)
        .single();

    if (fetchError || !current) return { error: 'Item not found' };

    const qty = input.quantity ?? current.quantity;
    const unitCost = input.unit_cost_pence ?? current.unit_cost_pence;
    const lineTotal = calcLineTotal(qty, unitCost);

    const { error } = await supabase
        .from('po_items')
        .update({
            description: input.description,
            quantity: qty,
            unit_cost_pence: unitCost,
            line_total_pence: lineTotal,
        })
        .eq('id', input.id);

    if (error) {
        console.error('Error updating PO item:', error);
        return { error: error.message };
    }

    await recalcPoTotal(supabase, input.po_id);
    revalidatePath(`/admin/purchase-orders/${input.po_id}`);
    return { success: true };
}

export async function deletePoItemAction(
    poId: string,
    itemId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('po_items')
        .delete()
        .eq('id', itemId)
        .eq('po_id', poId);

    if (error) {
        console.error('Error deleting PO item:', error);
        return { error: error.message };
    }

    await recalcPoTotal(supabase, poId);
    revalidatePath(`/admin/purchase-orders/${poId}`);
    return { success: true };
}

export async function deletePoAction(
    poId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', poId);

    if (error) {
        console.error('Error deleting PO:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/purchase-orders');
    return { success: true };
}
```

---

## Task 9 — PO list page

### `app/(portal)/admin/purchase-orders/page.tsx`

```tsx
import { requireAdmin } from '@/lib/auth';
import { getPurchaseOrders } from '@/lib/purchase-orders/queries';
import { PurchaseOrdersClient } from './PurchaseOrdersClient';

export default async function PurchaseOrdersPage() {
    await requireAdmin();
    const initialPos = await getPurchaseOrders();
    return <PurchaseOrdersClient initialPos={initialPos} />;
}
```

### `app/(portal)/admin/purchase-orders/PurchaseOrdersClient.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileText, Loader2, X } from 'lucide-react';
import { getPoListAction, createPoAction } from '@/lib/purchase-orders/actions';
import { getOrgListAction } from '@/lib/production/actions';
import {
    PO_STATUS_LABELS,
    PO_STATUS_COLORS,
    formatPence,
} from '@/lib/purchase-orders/utils';
import type { PurchaseOrder } from '@/lib/purchase-orders/types';

const STATUS_TABS = ['all', 'draft', 'sent', 'acknowledged', 'completed', 'cancelled'] as const;

interface PurchaseOrdersClientProps {
    initialPos: PurchaseOrder[];
}

export function PurchaseOrdersClient({ initialPos }: PurchaseOrdersClientProps) {
    const router = useRouter();
    const [pos, setPos] = useState(initialPos);
    const [activeStatus, setActiveStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [, startTransition] = useTransition();
    const [showNewModal, setShowNewModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function handleFilterChange(status: string, searchValue: string) {
        startTransition(async () => {
            const updated = await getPoListAction({
                status: status !== 'all' ? status : undefined,
                search: searchValue || undefined,
            });
            setPos(updated);
        });
    }

    function handleStatusTab(status: string) {
        setActiveStatus(status);
        handleFilterChange(status, search);
    }

    function handleSearch(value: string) {
        setSearch(value);
        handleFilterChange(activeStatus, value);
    }

    function formatDate(dateStr: string) {
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900">Purchase Orders</h1>
                    <p className="text-sm text-neutral-500 mt-0.5">{pos.length} order{pos.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800"
                >
                    <Plus size={16} />
                    New PO
                </button>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{errorMessage}</span>
                    <button onClick={() => setErrorMessage(null)}><X size={14} /></button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex gap-1 flex-wrap">
                    {STATUS_TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => handleStatusTab(tab)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                activeStatus === tab
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                        >
                            {tab === 'all' ? 'All' : PO_STATUS_LABELS[tab as keyof typeof PO_STATUS_LABELS]}
                        </button>
                    ))}
                </div>
                <div className="relative sm:ml-auto">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder="Search POs..."
                        className="pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] w-64 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
            </div>

            {/* Table */}
            {pos.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No purchase orders found</p>
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">PO Number</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Supplier</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">Description</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Total</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">Issued</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {pos.map(po => (
                                <tr
                                    key={po.id}
                                    onClick={() => router.push(`/admin/purchase-orders/${po.id}`)}
                                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-900">{po.po_number}</td>
                                    <td className="px-4 py-3 font-medium text-neutral-900">{po.supplier_name}</td>
                                    <td className="px-4 py-3 text-neutral-600 hidden md:table-cell max-w-xs truncate">{po.description}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${PO_STATUS_COLORS[po.status]}`}>
                                            {PO_STATUS_LABELS[po.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatPence(po.total_pence)}</td>
                                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">{formatDate(po.issue_date)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* New PO Modal */}
            {showNewModal && (
                <NewPoModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={(id) => router.push(`/admin/purchase-orders/${id}`)}
                    onError={setErrorMessage}
                />
            )}
        </div>
    );
}

function NewPoModal({
    onClose,
    onCreated,
    onError,
}: {
    onClose: () => void;
    onCreated: (id: string) => void;
    onError: (msg: string) => void;
}) {
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        org_id: '',
        supplier_name: '',
        description: '',
        required_by_date: '',
    });

    useState(() => {
        getOrgListAction().then(data => {
            setOrgs(data);
            if (data.length > 0) setForm(f => ({ ...f, org_id: data[0].id }));
            setOrgsLoading(false);
        });
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.supplier_name.trim() || !form.description.trim() || !form.org_id) return;
        setIsSaving(true);
        try {
            const result = await createPoAction({
                org_id: form.org_id,
                supplier_name: form.supplier_name.trim(),
                description: form.description.trim(),
                required_by_date: form.required_by_date || undefined,
            });
            if ('error' in result) {
                onError(result.error);
                onClose();
            } else {
                onCreated(result.id);
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-base font-semibold text-neutral-900">New Purchase Order</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {orgs.length > 1 && (
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Client Org</label>
                            <select
                                value={form.org_id}
                                onChange={e => setForm(f => ({ ...f, org_id: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                            >
                                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Name <span className="text-red-500">*</span></label>
                        <input
                            required
                            value={form.supplier_name}
                            onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                            placeholder="e.g. Invacare Print Supplies"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Description <span className="text-red-500">*</span></label>
                        <input
                            required
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="e.g. Vinyl wrap for HQ fascia"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Required By</label>
                        <input
                            type="date"
                            value={form.required_by_date}
                            onChange={e => setForm(f => ({ ...f, required_by_date: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
                        <button
                            type="submit"
                            disabled={isSaving || orgsLoading}
                            className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                            Create PO
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
```

---

## Task 10 — PO detail page

### `app/(portal)/admin/purchase-orders/[id]/page.tsx`

```tsx
import { requireAdmin } from '@/lib/auth';
import { getPoWithItems } from '@/lib/purchase-orders/queries';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetail } from './PurchaseOrderDetail';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const po = await getPoWithItems(id);
    if (!po) notFound();
    return <PurchaseOrderDetail initialPo={po} />;
}
```

### `app/(portal)/admin/purchase-orders/[id]/PurchaseOrderDetail.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Printer, Edit2, X, Save, Loader2,
    Plus, Trash2, AlertCircle, ExternalLink,
} from 'lucide-react';
import {
    updatePoAction,
    updatePoStatusAction,
    addPoItemAction,
    updatePoItemAction,
    deletePoItemAction,
    deletePoAction,
    getPoWithItemsAction,
} from '@/lib/purchase-orders/actions';
import {
    PO_STATUS_LABELS,
    PO_STATUS_COLORS,
    PO_STATUS_TRANSITIONS,
    formatPence,
    calcLineTotal,
} from '@/lib/purchase-orders/utils';
import type { PoWithItems, PoItem, PoStatus } from '@/lib/purchase-orders/types';

interface PurchaseOrderDetailProps {
    initialPo: PoWithItems;
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

export function PurchaseOrderDetail({ initialPo }: PurchaseOrderDetailProps) {
    const router = useRouter();
    const [po, setPo] = useState(initialPo);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isEditing, setIsEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    async function refresh() {
        const updated = await getPoWithItemsAction(po.id);
        if (updated) setPo(updated);
    }

    function handleStatusChange(newStatus: PoStatus) {
        setErrorMessage(null);
        startTransition(async () => {
            const result = await updatePoStatusAction(po.id, newStatus);
            if ('error' in result) {
                setErrorMessage(result.error);
            } else {
                await refresh();
            }
        });
    }

    async function handleDelete() {
        const result = await deletePoAction(po.id);
        if ('error' in result) {
            setErrorMessage(result.error);
            setShowDeleteConfirm(false);
        } else {
            router.push('/admin/purchase-orders');
        }
    }

    const allowedTransitions = PO_STATUS_TRANSITIONS[po.status];

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-6">
                <Link href="/admin/purchase-orders" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
                    <ArrowLeft size={14} />
                    Purchase Orders
                </Link>
                <span className="text-neutral-300">/</span>
                <span className="text-sm font-medium text-neutral-900 font-mono">{po.po_number}</span>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span className="text-sm font-medium">{errorMessage}</span>
                    </div>
                    <button onClick={() => setErrorMessage(null)}><X size={14} /></button>
                </div>
            )}

            {/* Header card */}
            <div className="border border-neutral-200 rounded-lg p-5 mb-4">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-semibold font-mono text-neutral-900">{po.po_number}</h1>
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${PO_STATUS_COLORS[po.status]}`}>
                                {PO_STATUS_LABELS[po.status]}
                            </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{po.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={`/print/admin/purchase-orders/${po.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50"
                        >
                            <Printer size={12} />
                            Print
                        </a>
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded"
                            >
                                <Edit2 size={12} />
                                Edit
                            </button>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <PoEditForm
                        po={po}
                        onSaved={async () => { setIsEditing(false); await refresh(); }}
                        onCancel={() => setIsEditing(false)}
                        onError={setErrorMessage}
                    />
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Supplier</div>
                            <div className="font-medium text-neutral-900">{po.supplier_name}</div>
                            {po.supplier_email && <div className="text-neutral-500 text-xs">{po.supplier_email}</div>}
                            {po.supplier_reference && <div className="text-neutral-500 text-xs">Ref: {po.supplier_reference}</div>}
                        </div>
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Issued</div>
                            <div className="text-neutral-900">{formatDate(po.issue_date)}</div>
                        </div>
                        {po.required_by_date && (
                            <div>
                                <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Required By</div>
                                <div className="text-neutral-900">{formatDate(po.required_by_date)}</div>
                            </div>
                        )}
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Total</div>
                            <div className="text-lg font-semibold text-neutral-900">{formatPence(po.total_pence)}</div>
                        </div>
                    </div>
                )}

                {/* Linked records */}
                {(po.linked_job || po.linked_quote) && (
                    <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-neutral-100">
                        {po.linked_job && (
                            <Link href={`/admin/jobs`} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900">
                                <ExternalLink size={11} />
                                Job {po.linked_job.job_number}: {po.linked_job.title}
                            </Link>
                        )}
                        {po.linked_quote && (
                            <Link href={`/admin/quotes/${po.linked_quote.id}`} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900">
                                <ExternalLink size={11} />
                                Quote {po.linked_quote.quote_number}{po.linked_quote.customer_name ? ` — ${po.linked_quote.customer_name}` : ''}
                            </Link>
                        )}
                    </div>
                )}
            </div>

            {/* Status workflow */}
            {allowedTransitions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {allowedTransitions.map(next => (
                        <button
                            key={next}
                            onClick={() => handleStatusChange(next)}
                            disabled={isPending}
                            className="px-4 py-2 text-sm font-medium border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-50"
                        >
                            {next === 'sent' && 'Mark as Sent'}
                            {next === 'acknowledged' && 'Mark Acknowledged'}
                            {next === 'completed' && 'Mark Completed'}
                            {next === 'cancelled' && 'Cancel PO'}
                            {next === 'draft' && 'Reopen as Draft'}
                        </button>
                    ))}
                </div>
            )}

            {/* Line items */}
            <LineItemsSection po={po} onRefresh={refresh} onError={setErrorMessage} />

            {/* Notes */}
            {(po.notes_supplier || po.notes_internal) && (
                <div className="border border-neutral-200 rounded-lg p-5 mt-4 space-y-3">
                    {po.notes_supplier && (
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Supplier Notes</div>
                            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{po.notes_supplier}</p>
                        </div>
                    )}
                    {po.notes_internal && (
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Internal Notes</div>
                            <p className="text-sm text-neutral-600 whitespace-pre-wrap">{po.notes_internal}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Danger zone */}
            {po.status === 'draft' && (
                <div className="mt-6 pt-6 border-t border-neutral-100">
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="text-xs text-red-600 hover:text-red-800"
                        >
                            Delete this purchase order
                        </button>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-neutral-700">Are you sure? This cannot be undone.</span>
                            <button onClick={handleDelete} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---- Inline edit form --------------------------------------------------------

function PoEditForm({
    po,
    onSaved,
    onCancel,
    onError,
}: {
    po: PoWithItems;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        supplier_name: po.supplier_name,
        supplier_email: po.supplier_email || '',
        supplier_reference: po.supplier_reference || '',
        description: po.description,
        required_by_date: po.required_by_date || '',
        notes_supplier: po.notes_supplier || '',
        notes_internal: po.notes_internal || '',
    });

    function field(name: keyof typeof form) {
        return {
            value: form[name],
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setForm(f => ({ ...f, [name]: e.target.value })),
        };
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSaving(true);
        try {
            const result = await updatePoAction({ id: po.id, ...form });
            if ('error' in result) {
                onError(result.error);
            } else {
                onSaved();
            }
        } finally {
            setIsSaving(false);
        }
    }

    const inputCls = 'w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-neutral-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Name</label>
                    <input required {...field('supplier_name')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Email</label>
                    <input type="email" {...field('supplier_email')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Reference</label>
                    <input {...field('supplier_reference')} className={inputCls} />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Description</label>
                    <input required {...field('description')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Required By</label>
                    <input type="date" {...field('required_by_date')} className={inputCls} />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Notes <span className="normal-case text-neutral-400">(appears on PO print)</span></label>
                <textarea {...field('notes_supplier')} rows={2} className={inputCls} />
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Internal Notes</label>
                <textarea {...field('notes_internal')} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-3">
                <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50">
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save
                </button>
            </div>
        </form>
    );
}

// ---- Line items section ------------------------------------------------------

function LineItemsSection({
    po,
    onRefresh,
    onError,
}: {
    po: PoWithItems;
    onRefresh: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const isEditable = po.status === 'draft';

    function handleDelete(itemId: string) {
        startTransition(async () => {
            const result = await deletePoItemAction(po.id, itemId);
            if ('error' in result) {
                onError(result.error);
            } else {
                await onRefresh();
            }
        });
    }

    return (
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-900">Line Items</h2>
                {isEditable && !showAddForm && (
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                    >
                        <Plus size={14} />
                        Add Item
                    </button>
                )}
            </div>

            {po.items.length === 0 && !showAddForm ? (
                <div className="px-5 py-8 text-center text-sm text-neutral-400">
                    No line items yet.{isEditable && ' Add items to build the PO total.'}
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="border-b border-neutral-100">
                        <tr>
                            <th className="text-left px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase">Description</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-20">Qty</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-28">Unit Cost</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-28">Total</th>
                            {isEditable && <th className="w-16" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                        {po.items.map(item => (
                            editingId === item.id ? (
                                <LineItemEditRow
                                    key={item.id}
                                    item={item}
                                    poId={po.id}
                                    onSaved={async () => { setEditingId(null); await onRefresh(); }}
                                    onCancel={() => setEditingId(null)}
                                    onError={onError}
                                />
                            ) : (
                                <tr key={item.id} className="hover:bg-neutral-50">
                                    <td className="px-5 py-3 text-neutral-800">{item.description}</td>
                                    <td className="px-5 py-3 text-right text-neutral-600">{item.quantity}</td>
                                    <td className="px-5 py-3 text-right text-neutral-600">{formatPence(item.unit_cost_pence)}</td>
                                    <td className="px-5 py-3 text-right font-medium text-neutral-900">{formatPence(item.line_total_pence)}</td>
                                    {isEditable && (
                                        <td className="px-3 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => setEditingId(item.id)} className="p-1 text-neutral-400 hover:text-neutral-900"><Edit2 size={13} /></button>
                                                <button onClick={() => handleDelete(item.id)} className="p-1 text-neutral-400 hover:text-red-600"><Trash2 size={13} /></button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            )
                        ))}
                        {showAddForm && (
                            <LineItemAddRow
                                poId={po.id}
                                onAdded={async () => { setShowAddForm(false); await onRefresh(); }}
                                onCancel={() => setShowAddForm(false)}
                                onError={onError}
                            />
                        )}
                    </tbody>
                    {po.items.length > 0 && (
                        <tfoot className="border-t-2 border-neutral-200">
                            <tr>
                                <td colSpan={isEditable ? 3 : 3} className="px-5 py-3 text-sm font-semibold text-right text-neutral-600">Total</td>
                                <td className="px-5 py-3 text-right text-lg font-bold text-neutral-900">{formatPence(po.total_pence)}</td>
                                {isEditable && <td />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            )}
        </div>
    );
}

function LineItemAddRow({
    poId,
    onAdded,
    onCancel,
    onError,
}: {
    poId: string;
    onAdded: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({ description: '', quantity: '1', unit_cost_pence: '' });
    const preview = calcLineTotal(Number(form.quantity) || 0, Math.round((parseFloat(form.unit_cost_pence) || 0) * 100));

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.description.trim()) return;
        setIsSaving(true);
        try {
            const result = await addPoItemAction({
                po_id: poId,
                description: form.description.trim(),
                quantity: parseInt(form.quantity) || 1,
                unit_cost_pence: Math.round((parseFloat(form.unit_cost_pence) || 0) * 100),
            });
            if ('error' in result) { onError(result.error); } else { onAdded(); }
        } finally { setIsSaving(false); }
    }

    const cellCls = 'px-2 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black w-full';

    return (
        <tr className="bg-neutral-50">
            <td className="px-3 py-2">
                <input required placeholder="Item description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={cellCls} />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-3 py-2 w-28">
                <input type="number" min="0" step="0.01" placeholder="0.00" value={form.unit_cost_pence} onChange={e => setForm(f => ({ ...f, unit_cost_pence: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-5 py-2 text-right text-sm font-medium text-neutral-900">{formatPence(preview)}</td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={handleSubmit as any} disabled={isSaving} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50">
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                    <button type="button" onClick={onCancel} className="p-1 text-neutral-400 hover:text-neutral-900"><X size={13} /></button>
                </div>
            </td>
        </tr>
    );
}

function LineItemEditRow({
    item,
    poId,
    onSaved,
    onCancel,
    onError,
}: {
    item: PoItem;
    poId: string;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        description: item.description,
        quantity: String(item.quantity),
        unit_cost_pence: (item.unit_cost_pence / 100).toFixed(2),
    });
    const preview = calcLineTotal(Number(form.quantity) || 0, Math.round((parseFloat(form.unit_cost_pence) || 0) * 100));

    async function handleSave() {
        setIsSaving(true);
        try {
            const result = await updatePoItemAction({
                id: item.id,
                po_id: poId,
                description: form.description.trim(),
                quantity: parseInt(form.quantity) || 1,
                unit_cost_pence: Math.round((parseFloat(form.unit_cost_pence) || 0) * 100),
            });
            if ('error' in result) { onError(result.error); } else { onSaved(); }
        } finally { setIsSaving(false); }
    }

    const cellCls = 'px-2 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black w-full';

    return (
        <tr className="bg-blue-50">
            <td className="px-3 py-2">
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={cellCls} />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-3 py-2 w-28">
                <input type="number" min="0" step="0.01" value={form.unit_cost_pence} onChange={e => setForm(f => ({ ...f, unit_cost_pence: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-5 py-2 text-right text-sm font-medium text-neutral-900">{formatPence(preview)}</td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={handleSave} disabled={isSaving} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50">
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                    <button type="button" onClick={onCancel} className="p-1 text-neutral-400 hover:text-neutral-900"><X size={13} /></button>
                </div>
            </td>
        </tr>
    );
}
```

---

## Task 11 — PO print view

**File:** `app/(print)/admin/purchase-orders/[id]/page.tsx`

```tsx
import { requireAdmin } from '@/lib/auth';
import { getPoWithItems } from '@/lib/purchase-orders/queries';
import { notFound } from 'next/navigation';
import { formatPence } from '@/lib/purchase-orders/utils';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    });
}

export default async function PoPrintPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const po = await getPoWithItems(id);
    if (!po) notFound();

    return (
        <div className="print-view-root">
            <title>{po.po_number} — Purchase Order</title>
            <style>{`
                @media print {
                    @page { margin: 15mm; size: A4; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-hint { display: none !important; }
                }
                .print-view-root {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 210mm;
                    margin: 0 auto;
                    padding: 20mm;
                    color: #1a1a1a;
                    background: white;
                    min-height: 100vh;
                }
                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #4e7e8c; }
                .po-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #4e7e8c; margin-bottom: 4px; }
                .po-number { font-size: 18px; font-weight: 700; color: #1a1a1a; }
                .po-date { font-size: 12px; color: #666; margin-top: 4px; }
                .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 8px; }
                .party-name { font-size: 15px; font-weight: 600; }
                .party-detail { font-size: 12px; color: #666; margin-top: 2px; }
                .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
                .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                .items-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; padding: 10px 8px; border-bottom: 2px solid #ddd; }
                .items-table th:last-child { text-align: right; }
                .items-table th:nth-child(2), .items-table th:nth-child(3) { text-align: right; }
                .items-table td { padding: 14px 8px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
                .items-table td:nth-child(2), .items-table td:nth-child(3) { text-align: right; color: #555; }
                .items-table td:last-child { text-align: right; font-weight: 600; }
                .total-row { display: flex; justify-content: flex-end; margin-bottom: 32px; }
                .total-box { border: 2px solid #1a1a1a; padding: 16px 24px; min-width: 200px; display: flex; justify-content: space-between; align-items: baseline; gap: 24px; }
                .total-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
                .total-value { font-size: 22px; font-weight: 700; }
                .notes-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; }
                .notes-content { font-size: 12px; color: #555; white-space: pre-wrap; line-height: 1.6; }
                .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
                .print-hint { position: fixed; top: 16px; right: 16px; background: #000; color: white; padding: 12px 16px; border-radius: 8px; font-size: 13px; z-index: 9999; }
                .print-hint button { background: white; color: #000; border: none; padding: 8px 16px; margin-left: 12px; border-radius: 4px; cursor: pointer; font-weight: 600; }
            `}</style>

            <div className="print-hint">
                Purchase Order — Ready to print
                <button id="printBtn">Print / Save PDF</button>
            </div>

            <script dangerouslySetInnerHTML={{ __html: `
                (function() {
                    function init() {
                        var btn = document.getElementById('printBtn');
                        if (btn) btn.onclick = function() { window.print(); };
                        setTimeout(function() { window.print(); }, 500);
                    }
                    if (document.readyState === 'complete') { init(); }
                    else { window.addEventListener('load', init); }
                })();
            ` }} />

            {/* Header */}
            <div className="header">
                <div>
                    <img src="/logo-black.svg" alt="Onesign & Digital" style={{ height: '22px', width: 'auto' }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="po-badge">Purchase Order</div>
                    <div className="po-number">{po.po_number}</div>
                    <div className="po-date">Issued: {formatDate(po.issue_date)}</div>
                    {po.required_by_date && (
                        <div className="po-date">Required by: {formatDate(po.required_by_date)}</div>
                    )}
                </div>
            </div>

            {/* Parties */}
            <div className="parties">
                <div>
                    <div className="section-title">From</div>
                    <div className="party-name">Onesign & Digital</div>
                    <div className="party-detail">Team Valley Trading Estate</div>
                    <div className="party-detail">Gateshead, NE11</div>
                </div>
                <div>
                    <div className="section-title">To (Supplier)</div>
                    <div className="party-name">{po.supplier_name}</div>
                    {po.supplier_email && <div className="party-detail">{po.supplier_email}</div>}
                    {po.supplier_reference && <div className="party-detail">Ref: {po.supplier_reference}</div>}
                </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '24px' }}>
                <div className="section-title">Order Description</div>
                <p style={{ fontSize: '14px', fontWeight: 500 }}>{po.description}</p>
            </div>

            {/* Line items */}
            <table className="items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style={{ width: '80px' }}>Qty</th>
                        <th style={{ width: '120px' }}>Unit Cost</th>
                        <th style={{ width: '120px' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {po.items.map((item) => (
                        <tr key={item.id}>
                            <td>{item.description}</td>
                            <td>{item.quantity}</td>
                            <td>{formatPence(item.unit_cost_pence)}</td>
                            <td>{formatPence(item.line_total_pence)}</td>
                        </tr>
                    ))}
                    {po.items.length === 0 && (
                        <tr>
                            <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>No line items</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Total */}
            <div className="total-row">
                <div className="total-box">
                    <div className="total-label">Order Total</div>
                    <div className="total-value">{formatPence(po.total_pence)}</div>
                </div>
            </div>

            {/* Supplier notes */}
            {po.notes_supplier && (
                <div className="notes-section">
                    <div className="section-title">Notes for Supplier</div>
                    <div className="notes-content">{po.notes_supplier}</div>
                </div>
            )}

            {/* Footer */}
            <div className="footer">
                Onesign & Digital • {po.po_number} • Generated {formatDate(new Date().toISOString())}
            </div>
        </div>
    );
}
```

---

## Task 12 — Sidebar update

**File:** `app/(portal)/components/Sidebar.tsx`

Add `ShoppingCart` to the lucide import and a "Purchase Orders" entry to the Sales group.

**Import change:**
```typescript
import {
    // ... existing imports ...
    ShoppingCart,
} from 'lucide-react';
```

**Sales group change** (add Purchase Orders after Quotes):
```typescript
{
    label: 'Sales',
    items: [
        { label: 'Quotes', href: '/admin/quotes', icon: Calculator },
        { label: 'Purchase Orders', href: '/admin/purchase-orders', icon: ShoppingCart },  // ← NEW
        { label: 'Leads', href: '/admin/leads', icon: Users },
        { label: 'Pricing', href: '/admin/pricing', icon: DollarSign },
    ],
},
```

---

## Task 13 — Final verification

```bash
# Run utils tests
npx vitest run lib/purchase-orders/utils.test.ts

# Run all tests (ensure nothing broken)
npx vitest run

# Type-check
npx tsc --noEmit

# Build
npx next build
```

All must pass before the branch is ready for review.

---

## Code review checklist (before PR)

- [ ] All server actions call `getUser()` before any DB operation
- [ ] `recalcPoTotal` called after every item add/update/delete
- [ ] `revalidatePath` called on both list and detail paths after mutations
- [ ] No `line_total_pence` is trusted from client — always recalculated from `qty * unit_cost` in action
- [ ] RLS policies cover both `purchase_orders` and `po_items`
- [ ] Print page has `requireAdmin()` guard
- [ ] No `/app/` prefix in any `href` or `revalidatePath`
- [ ] `useState` initialised with `() =>` lazy form in `NewPoModal` (avoids re-running on every render)
- [ ] `utils.test.ts` passes before claiming Task 6 complete

---

## Execution order

Tasks 1–4 are independent of the PO work — do them first and commit.
Tasks 5–8 are the PO backend — write tests, then implement, then verify tests pass.
Tasks 9–11 are the PO frontend — implement after backend is solid.
Task 12 (sidebar) is the last touch before the final build.
