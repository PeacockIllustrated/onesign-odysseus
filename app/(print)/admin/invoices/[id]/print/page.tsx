import { requireAdmin } from '@/lib/auth';
import { getInvoiceWithItems } from '@/lib/invoices/queries';
import { formatPence } from '@/lib/invoices/utils';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    });
}

export default async function InvoicePrintPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const invoice = await getInvoiceWithItems(id);
    if (!invoice) notFound();

    const paymentTermsLabel = invoice.payment_terms_days === 0
        ? 'Due on receipt'
        : `Net ${invoice.payment_terms_days}`;

    return (
        <div className="print-view-root">
            <title>{invoice.invoice_number} — Invoice</title>
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
                .inv-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #4e7e8c; margin-bottom: 4px; }
                .inv-number { font-size: 18px; font-weight: 700; color: #1a1a1a; }
                .inv-date { font-size: 12px; color: #666; margin-top: 4px; }
                .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 8px; }
                .party-name { font-size: 15px; font-weight: 600; }
                .party-detail { font-size: 12px; color: #666; margin-top: 2px; }
                .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
                .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                .items-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; padding: 10px 8px; border-bottom: 2px solid #ddd; background: #f5f5f5; }
                .items-table th:nth-child(2), .items-table th:nth-child(3), .items-table th:nth-child(4) { text-align: right; }
                .items-table td { padding: 14px 8px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
                .items-table td:nth-child(2), .items-table td:nth-child(3) { text-align: right; color: #555; }
                .items-table td:nth-child(4) { text-align: right; font-weight: 600; }
                .totals-row { display: flex; justify-content: flex-end; margin-bottom: 32px; }
                .totals-box { min-width: 240px; }
                .totals-line { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; font-size: 13px; color: #555; }
                .totals-line-label { text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
                .totals-divider { border-top: 2px solid #1a1a1a; margin: 8px 0; }
                .totals-total { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; }
                .totals-total-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
                .totals-total-value { font-size: 22px; font-weight: 700; }
                .total-border { border: 2px solid #1a1a1a; padding: 16px 24px; }
                .notes-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; }
                .notes-content { font-size: 12px; color: #555; white-space: pre-wrap; line-height: 1.6; }
                .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
                .print-hint { position: fixed; top: 16px; right: 16px; background: #000; color: white; padding: 12px 16px; border-radius: 8px; font-size: 13px; z-index: 9999; }
                .print-hint button { background: white; color: #000; border: none; padding: 8px 16px; margin-left: 12px; border-radius: 4px; cursor: pointer; font-weight: 600; }
            `}</style>

            <div className="print-hint">
                Invoice — Ready to print
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
                    <div className="inv-badge">Invoice</div>
                    <div className="inv-number">{invoice.invoice_number}</div>
                    <div className="inv-date">Invoice Date: {formatDate(invoice.invoice_date)}</div>
                    {invoice.due_date && (
                        <div className="inv-date">Due Date: {formatDate(invoice.due_date)}</div>
                    )}
                    <div className="inv-date">Payment Terms: {paymentTermsLabel}</div>
                </div>
            </div>

            {/* Parties */}
            <div className="parties">
                <div>
                    <div className="section-title">From</div>
                    <div className="party-name">Onesign & Digital</div>
                    <div className="party-detail">Unit 6, Team Valley Trading Estate</div>
                    <div className="party-detail">Earlsway, Gateshead</div>
                    <div className="party-detail">NE11 0QH</div>
                </div>
                <div>
                    <div className="section-title">To</div>
                    <div className="party-name">{invoice.customer_name}</div>
                    {invoice.customer_email && <div className="party-detail">{invoice.customer_email}</div>}
                    {invoice.customer_phone && <div className="party-detail">{invoice.customer_phone}</div>}
                    {invoice.customer_reference && <div className="party-detail">Ref: {invoice.customer_reference}</div>}
                </div>
            </div>

            {/* Project name if present */}
            {invoice.project_name && (
                <div style={{ marginBottom: '24px' }}>
                    <div className="section-title">Project</div>
                    <p style={{ fontSize: '14px', fontWeight: 500 }}>{invoice.project_name}</p>
                </div>
            )}

            {/* Line items */}
            <table className="items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style={{ width: '80px' }}>Qty</th>
                        <th style={{ width: '120px' }}>Unit Price</th>
                        <th style={{ width: '120px' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.items.map((item) => (
                        <tr key={item.id}>
                            <td>{item.description}</td>
                            <td>{item.quantity}</td>
                            <td>{formatPence(item.unit_price_pence)}</td>
                            <td>{formatPence(item.line_total_pence)}</td>
                        </tr>
                    ))}
                    {invoice.items.length === 0 && (
                        <tr>
                            <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>No line items</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Totals */}
            <div className="totals-row">
                <div className="total-border">
                    <div className="totals-box">
                        <div className="totals-line">
                            <span className="totals-line-label">Subtotal</span>
                            <span>{formatPence(invoice.subtotal_pence)}</span>
                        </div>
                        <div className="totals-line">
                            <span className="totals-line-label">VAT ({invoice.vat_rate}%)</span>
                            <span>{formatPence(invoice.vat_pence)}</span>
                        </div>
                        <div className="totals-divider" />
                        <div className="totals-total">
                            <span className="totals-total-label">Total</span>
                            <span className="totals-total-value">{formatPence(invoice.total_pence)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment terms */}
            <div className="notes-section">
                <div className="section-title">Payment Terms</div>
                <div className="notes-content">
                    {invoice.payment_terms_days === 0
                        ? 'Payment is due upon receipt of this invoice.'
                        : `Payment is due within ${invoice.payment_terms_days} days of the invoice date.`}
                </div>
            </div>

            {/* Customer notes */}
            {invoice.notes_customer && (
                <div className="notes-section">
                    <div className="section-title">Notes</div>
                    <div className="notes-content">{invoice.notes_customer}</div>
                </div>
            )}

            {/* Footer */}
            <div className="footer">
                Onesign & Digital &bull; {invoice.invoice_number} &bull; Generated {formatDate(new Date().toISOString())}
            </div>
        </div>
    );
}
