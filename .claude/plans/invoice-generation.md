# Invoice Generation — Closing the Production Loop

## Goal

When a quote is accepted and production completes, generate an invoice from the accepted quote data. Follows the PO module's patterns exactly (same list/detail/print structure, same status workflow, same sidebar placement).

## Flow

```
Quote accepted → Production job created → Items flow through pipeline →
Items reach Goods Out → Generate Invoice → Send → Mark Paid
```

## Database: Migration 031

### `invoices` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| invoice_number | TEXT UNIQUE | Auto: `INV-YYYY-NNNNNN` |
| org_id | UUID NOT NULL FK→orgs | RLS scoped |
| quote_id | UUID NOT NULL FK→quotes | ON DELETE RESTRICT |
| production_job_id | UUID FK→production_jobs | ON DELETE SET NULL |
| customer_name | TEXT NOT NULL | Denormalized from quote |
| customer_email | TEXT | |
| customer_phone | TEXT | |
| customer_reference | TEXT | |
| project_name | TEXT | |
| status | TEXT CHECK | `draft`, `sent`, `paid`, `overdue`, `cancelled` |
| invoice_date | DATE DEFAULT now | |
| due_date | DATE | Calculated: invoice_date + payment_terms_days |
| payment_terms_days | INTEGER DEFAULT 30 | Net 30 default |
| notes_internal | TEXT | |
| notes_customer | TEXT | Shown on printed invoice |
| subtotal_pence | INTEGER DEFAULT 0 | Sum of line items |
| vat_rate | NUMERIC(5,2) DEFAULT 20.00 | UK standard rate |
| vat_pence | INTEGER DEFAULT 0 | Calculated from subtotal |
| total_pence | INTEGER DEFAULT 0 | subtotal + VAT |
| created_by | UUID FK→auth.users | |
| created_at, updated_at | TIMESTAMPTZ | |

Auto-number: `INV-YYYY-NNNNNN` via sequence + trigger (same pattern as PO).

### `invoice_items` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| invoice_id | UUID FK→invoices CASCADE | |
| quote_item_id | UUID FK→quote_items | Lineage back to pricing engine |
| description | TEXT NOT NULL | Copied from quote item at creation |
| quantity | INTEGER DEFAULT 1 | |
| unit_price_pence | INTEGER DEFAULT 0 | From quote_items.line_total_pence / qty |
| line_total_pence | INTEGER DEFAULT 0 | |
| sort_order | INTEGER DEFAULT 0 | |
| created_at | TIMESTAMPTZ | |

### Unique constraint

One non-cancelled invoice per quote:
```sql
CREATE UNIQUE INDEX idx_one_invoice_per_quote
  ON invoices(quote_id) WHERE status != 'cancelled';
```

### RLS

Same pattern as POs:
- Super admins: full access
- `is_org_member(org_id)`: read/write their org

### Trigger + Realtime

- Auto-generate `invoice_number` on INSERT
- Add `invoices` to `supabase_realtime` publication

---

## Types: `lib/invoices/types.ts`

```typescript
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  invoice_number: string;
  org_id: string;
  quote_id: string;
  production_job_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_reference: string | null;
  project_name: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  payment_terms_days: number;
  notes_internal: string | null;
  notes_customer: string | null;
  subtotal_pence: number;
  vat_rate: number;
  vat_pence: number;
  total_pence: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem { ... }

export interface InvoiceWithItems extends Invoice {
  items: InvoiceItem[];
  linked_quote: { id: string; quote_number: string } | null;
  linked_job: { id: string; job_number: string; status: string } | null;
}
```

---

## Utils: `lib/invoices/utils.ts`

Mirror PO utils:
- `INVOICE_STATUS_TRANSITIONS` — draft→sent→paid; draft/sent→cancelled; cancelled→draft
- `canTransitionTo(current, next)`
- `STATUS_LABELS`, `STATUS_COLORS`
- `formatPence()` — reuse from PO utils or shared
- `calcInvoiceTotal(items)` → subtotal
- `calcVat(subtotalPence, vatRate)` → vat amount
- Unit tests for transitions + calculations

---

## Queries: `lib/invoices/queries.ts`

- `getInvoices(filters?)` — list with status/search filters, ordered by created_at DESC
- `getInvoiceWithItems(id)` — invoice + items + linked quote + linked job

---

## Actions: `lib/invoices/actions.ts`

### `createInvoiceFromQuote(quoteId, orgId)`

1. Verify quote is `accepted`
2. Check no existing non-cancelled invoice for this quote
3. Lookup production_job by quote_id (optional link)
4. Copy customer data from quote
5. Map each `quote_item` → `invoice_item` (description derived same as production)
6. Calculate subtotal from items, VAT at 20%, total
7. INSERT invoice + items
8. Revalidate paths
9. Return `{ id, invoiceNumber }`

### `updateInvoice(id, fields)`
Only on draft. Update customer details, payment terms, dates, notes.

### `updateInvoiceStatus(id, newStatus)`
Validate transition. If marking `sent`, set `due_date = invoice_date + payment_terms_days` if not already set.

### `addInvoiceItem(invoiceId, item)` / `updateInvoiceItem` / `deleteInvoiceItem`
Only on draft. Recalc totals after each change.

### `deleteInvoice(id)`
Only on draft status.

### `recalcInvoiceTotals(supabase, invoiceId)`
Helper: sum items → subtotal, calc VAT, update invoice header.

---

## UI Pages

### Sidebar

Add "Invoices" to the Sales group (after Quotes, before Purchase Orders):
```typescript
{ label: 'Invoices', href: '/admin/invoices', icon: FileText }
```

### List: `/admin/invoices`

Mirror PO list exactly:
- Status tabs: All | Draft | Sent | Paid | Overdue | Cancelled
- Search: invoice_number, customer_name
- Table columns: Invoice # | Customer | Project | Status | Total | Date | Due
- "New Invoice" button → opens modal to select from accepted quotes without invoices
- Row click → detail page

### Detail: `/admin/invoices/[id]`

Mirror PO detail:
- Header: invoice_number + customer_name + status chip
- Edit fields (draft only): customer details, payment terms, dates, notes
- Line items table with add/edit/delete (draft only)
- Subtotal / VAT / Total box
- Status transition buttons
- Links to source quote + production job
- "Print / PDF" button → print page

### Print: `/(print)/admin/invoices/[id]/print`

A4 layout matching PO print template:
- Header: Onesign logo + "INVOICE" badge + invoice number + dates
- From: Onesign & Digital address
- To: Customer (from invoice)
- Items table: Description | Qty | Unit Price | Line Total
- Subtotal / VAT / Total box
- Payment terms note
- Notes to customer (if present)
- Footer with generated date

### Quote detail page: "Generate Invoice" button

On the accepted quote detail page (`/admin/quotes/[id]`), add a "Generate Invoice" button next to the existing "Create Job" button. Shows when:
- Quote is `accepted`
- No existing non-cancelled invoice for this quote

Button calls `createInvoiceFromQuote`, then navigates to the new invoice.

### Admin dashboard integration

Add to the admin overview page:
- "Uninvoiced completed jobs" count/list
- Recent invoices summary

---

## Task Breakdown

| # | Task | Files |
|---|------|-------|
| 1 | Migration 031 | `supabase/migrations/031_create_invoices.sql` |
| 2 | Types + utils + tests | `lib/invoices/types.ts`, `utils.ts`, `utils.test.ts` |
| 3 | Queries + actions | `lib/invoices/queries.ts`, `actions.ts` |
| 4 | Sidebar + list page | `Sidebar.tsx`, `app/(portal)/admin/invoices/page.tsx`, `InvoicesClient.tsx` |
| 5 | Detail page | `app/(portal)/admin/invoices/[id]/page.tsx`, `InvoiceDetail.tsx` |
| 6 | Print page | `app/(print)/admin/invoices/[id]/print/page.tsx` |
| 7 | Quote detail "Generate Invoice" button | `app/(portal)/admin/quotes/[id]/page.tsx`, `CreateInvoiceButton.tsx` |
| 8 | Admin dashboard integration | `app/(portal)/admin/page.tsx` |
