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
                .items-table th:nth-child(2), .items-table th:nth-child(3), .items-table th:nth-child(4) { text-align: right; }
                .items-table td { padding: 14px 8px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
                .items-table td:nth-child(2), .items-table td:nth-child(3) { text-align: right; color: #555; }
                .items-table td:nth-child(4) { text-align: right; font-weight: 600; }
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
                    <img src="/Odysseus-Logo-Black.svg" alt="Onesign & Digital" style={{ height: '22px', width: 'auto' }} />
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
