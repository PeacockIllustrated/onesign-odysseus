import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { Quote, QuoteItem } from '@/lib/quoter/types';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
}

function formatPence(pence: number): string {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
    }).format(pence / 100);
}

function getItemSummary(item: QuoteItem): string {
    const output = item.output_json as {
        derived?: {
            panels_needed?: number;
            area_m2?: number;
            adjusted_width_mm?: number;
            adjusted_height_mm?: number;
        };
        letter_sets_breakdown?: Array<{ qty: number; type: string; height_mm: number }>;
    };

    const parts: string[] = [];

    if (output.derived?.adjusted_width_mm && output.derived?.adjusted_height_mm) {
        parts.push(`${output.derived.adjusted_width_mm}×${output.derived.adjusted_height_mm}mm`);
    }

    if (output.derived?.panels_needed) {
        parts.push(`${output.derived.panels_needed} panel${output.derived.panels_needed > 1 ? 's' : ''}`);
    }

    if (output.letter_sets_breakdown && output.letter_sets_breakdown.length > 0) {
        const letterSummary = output.letter_sets_breakdown
            .map(s => `${s.qty}× ${s.type} ${s.height_mm}mm`)
            .join(', ');
        parts.push(letterSummary);
    }

    return parts.join(' • ') || 'Panel + Letters';
}

function getCostBreakdown(item: QuoteItem): { label: string; value: number }[] {
    const output = item.output_json as {
        costs?: {
            panel_overall_cost_pence?: number;
            letters_total_cost_pence?: number;
            labour_cost_pence?: number;
            materials_markup_pence?: number;
            aperture_total_cost_pence?: number;
            transformer_cost_pence?: number;
        };
    };

    if (!output.costs) return [];

    const breakdown: { label: string; value: number }[] = [];

    if (output.costs.panel_overall_cost_pence) {
        breakdown.push({ label: 'Panels', value: output.costs.panel_overall_cost_pence });
    }
    if (output.costs.aperture_total_cost_pence) {
        breakdown.push({ label: 'Aperture', value: output.costs.aperture_total_cost_pence });
    }
    if (output.costs.transformer_cost_pence) {
        breakdown.push({ label: 'Transformers', value: output.costs.transformer_cost_pence });
    }
    if (output.costs.letters_total_cost_pence) {
        breakdown.push({ label: 'Letters', value: output.costs.letters_total_cost_pence });
    }
    if (output.costs.labour_cost_pence) {
        breakdown.push({ label: 'Labour', value: output.costs.labour_cost_pence });
    }
    if (output.costs.materials_markup_pence) {
        breakdown.push({ label: 'Markup', value: output.costs.materials_markup_pence });
    }

    return breakdown;
}

export default async function QuotePrintPage({ params }: PageProps) {
    await requireAdmin();

    const { id } = await params;
    const supabase = await createServerClient();

    // Fetch quote
    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', id)
        .single();

    if (quoteError || !quote) {
        notFound();
    }

    // Fetch quote items
    const { data: items } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', id)
        .order('created_at', { ascending: true });

    const quoteData = quote as Quote;
    const itemsData = (items || []) as QuoteItem[];
    const grandTotal = itemsData.reduce((sum, item) => sum + (item.line_total_pence || 0), 0);

    return (
        <div className="print-view-root">
            <title>Quote {quoteData.quote_number} - OneSign</title>
            <style>{`
                @media print {
                    @page {
                        margin: 15mm;
                        size: A4;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .print-hint {
                        display: none !important;
                    }
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
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 32px;
                    padding-bottom: 24px;
                    border-bottom: 2px solid #000;
                }
                .logo {
                    display: flex;
                    align-items: center;
                }
                .logo img {
                    height: 24px;
                    width: auto;
                }
                .quote-info {
                    text-align: right;
                }
                .quote-number {
                    font-size: 14px;
                    font-weight: 600;
                }
                .quote-date {
                    font-size: 12px;
                    color: #666;
                }
                .customer-section {
                    margin-bottom: 32px;
                }
                .section-title {
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #666;
                    margin-bottom: 8px;
                }
                .customer-name {
                    font-size: 16px;
                    font-weight: 600;
                }
                .customer-contact {
                    font-size: 13px;
                    color: #666;
                }
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 24px;
                }
                .items-table th {
                    text-align: left;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #666;
                    padding: 12px 8px;
                    border-bottom: 1px solid #ddd;
                }
                .items-table th:last-child {
                    text-align: right;
                }
                .items-table td {
                    padding: 16px 8px;
                    border-bottom: 1px solid #eee;
                    font-size: 13px;
                }
                .item-type {
                    font-weight: 600;
                }
                .item-summary {
                    color: #666;
                    font-size: 12px;
                }
                .item-breakdown {
                    margin-top: 8px;
                    font-size: 11px;
                    color: #888;
                }
                .item-total {
                    text-align: right;
                    font-weight: 600;
                }
                .totals-section {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 32px;
                }
                .totals-box {
                    border: 2px solid #000;
                    padding: 16px 24px;
                    min-width: 240px;
                }
                .totals-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    gap: 24px;
                }
                .totals-row + .totals-row {
                    margin-top: 6px;
                }
                .totals-row.grand-total {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid #ddd;
                }
                .total-label {
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #666;
                }
                .total-value {
                    font-size: 14px;
                    font-weight: 600;
                    text-align: right;
                }
                .total-value.grand {
                    font-size: 24px;
                    font-weight: 700;
                }
                .notes-section {
                    margin-top: 48px;
                    padding-top: 24px;
                    border-top: 1px solid #ddd;
                }
                .notes-title {
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #666;
                    margin-bottom: 12px;
                }
                .notes-content {
                    font-size: 11px;
                    color: #666;
                    line-height: 1.6;
                }
                .notes-content li {
                    margin-bottom: 4px;
                }
                .footer {
                    margin-top: 48px;
                    padding-top: 16px;
                    border-top: 1px solid #eee;
                    font-size: 10px;
                    color: #999;
                    text-align: center;
                }
                .print-hint {
                    position: fixed;
                    top: 16px;
                    right: 16px;
                    background: #000;
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 13px;
                    z-index: 9999;
                }
                .print-hint button {
                    background: white;
                    color: #000;
                    border: none;
                    padding: 8px 16px;
                    margin-left: 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 600;
                }
            `}</style>

            {/* Print hint (hidden when printing) */}
            <div className="print-hint">
                Ready to save as PDF
                <button id="printBtn">Print</button>
            </div>

            <script dangerouslySetInnerHTML={{
                __html: `
                (function() {
                    function initPrint() {
                        const btn = document.getElementById('printBtn');
                        if (btn) btn.onclick = () => window.print();
                        // Delay slightly to ensure styles are applied before print dialog
                        setTimeout(() => window.print(), 500);
                    }
                    if (document.readyState === 'complete') {
                        initPrint();
                    } else {
                        window.addEventListener('load', initPrint);
                    }
                })();
            ` }} />

            {/* Header */}
            <div className="header">
                <div className="logo">
                    <img src="/Odysseus-Logo-Black.svg" alt="OneSign" />
                </div>
                <div className="quote-info">
                    <div className="quote-number">{quoteData.quote_number}</div>
                    <div className="quote-date">{formatDate(quoteData.created_at)}</div>
                    {quoteData.valid_until && (
                        <div className="quote-date" style={{ marginTop: '4px' }}>
                            Valid until: {new Date(quoteData.valid_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                    )}
                </div>
            </div>

            {/* Customer Details */}
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
            </div>

            {/* Line Items */}
            <table className="items-table">
                <thead>
                    <tr>
                        <th style={{ width: '60px' }}>#</th>
                        <th>Description</th>
                        <th style={{ width: '120px' }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {itemsData.map((item, index) => {
                        const breakdown = getCostBreakdown(item);
                        return (
                            <tr key={item.id}>
                                <td>{index + 1}</td>
                                <td>
                                    <div className="item-type">
                                        {item.item_type === 'panel_letters_v1' ? 'Panel + Letters' : item.item_type}
                                    </div>
                                    <div className="item-summary">{getItemSummary(item)}</div>
                                    {breakdown.length > 0 && (
                                        <div className="item-breakdown">
                                            {breakdown.map((b, i) => (
                                                <span key={b.label}>
                                                    {b.label}: {formatPence(b.value)}
                                                    {i < breakdown.length - 1 ? ' | ' : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="item-total">{formatPence(item.line_total_pence)}</td>
                            </tr>
                        );
                    })}
                    {itemsData.length === 0 && (
                        <tr>
                            <td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>
                                No line items
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Totals */}
            <div className="totals-section">
                <div className="totals-box">
                    <div className="totals-row">
                        <div className="total-label">Subtotal (ex. VAT)</div>
                        <div className="total-value">{formatPence(grandTotal)}</div>
                    </div>
                    <div className="totals-row">
                        <div className="total-label">VAT (20%)</div>
                        <div className="total-value">{formatPence(Math.round(grandTotal * 0.2))}</div>
                    </div>
                    <div className="totals-row grand-total">
                        <div className="total-label">Total</div>
                        <div className="total-value grand">{formatPence(grandTotal + Math.round(grandTotal * 0.2))}</div>
                    </div>
                </div>
            </div>

            {/* Notes */}
            <div className="notes-section">
                <div className="notes-title">Terms & Conditions</div>
                <div className="notes-content">
                    <ul>
                        <li>This quotation is valid until {quoteData.valid_until ? new Date(quoteData.valid_until).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '30 days from the date shown above'}.</li>
                        <li>All prices are shown excluding and including VAT at 20%.</li>
                        <li>Lead times will be confirmed upon order placement.</li>
                        <li>A 50% deposit is required to proceed with manufacturing.</li>
                        <li>Installation is quoted separately unless included in line items.</li>
                    </ul>
                </div>
            </div>

            {/* Footer */}
            <div className="footer">
                OneSign & Digital • Quote generated on {formatDate(new Date().toISOString())}
            </div>
        </div>
    );
}
