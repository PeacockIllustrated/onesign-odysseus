import { requireAdmin } from '@/lib/auth';
import { getDeliveryWithItems } from '@/lib/deliveries/queries';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    });
}

export default async function DeliveryNotePrintPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const delivery = await getDeliveryWithItems(id);
    if (!delivery) notFound();

    const contactName = delivery.delivery_contact
        ? `${delivery.delivery_contact.first_name} ${delivery.delivery_contact.last_name}`
        : null;
    const contactPhone = delivery.delivery_contact?.phone ?? null;

    return (
        <div className="print-view-root">
            <title>{delivery.delivery_number} — Delivery Note</title>
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
                .dn-badge { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: #4e7e8c; margin-bottom: 4px; }
                .dn-number { font-size: 18px; font-weight: 700; color: #1a1a1a; }
                .dn-date { font-size: 12px; color: #666; margin-top: 4px; }
                .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 8px; }
                .party-name { font-size: 15px; font-weight: 600; }
                .party-detail { font-size: 12px; color: #666; margin-top: 2px; }
                .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
                .job-ref { margin-bottom: 32px; }
                .job-ref-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 4px; }
                .job-ref-value { font-size: 14px; font-weight: 500; }
                .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                .items-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #666; padding: 10px 8px; border-bottom: 2px solid #ddd; background: #f5f5f5; }
                .items-table th:nth-child(1) { width: 50px; text-align: center; }
                .items-table th:nth-child(3) { width: 80px; text-align: right; }
                .items-table td { padding: 14px 8px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
                .items-table td:nth-child(1) { text-align: center; color: #999; }
                .items-table td:nth-child(3) { text-align: right; font-weight: 500; }
                .driver-notes { margin-bottom: 32px; padding: 16px 20px; border: 1px solid #e5e5e5; border-left: 4px solid #4e7e8c; border-radius: 4px; background: #f8fafb; }
                .driver-notes-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #4e7e8c; margin-bottom: 8px; }
                .driver-notes-content { font-size: 13px; color: #333; white-space: pre-wrap; line-height: 1.6; }
                .signature-section { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
                .signature-line { padding-top: 8px; border-top: 1px solid #333; }
                .signature-label { font-size: 12px; color: #666; margin-top: 6px; }
                .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
                .print-hint { position: fixed; top: 16px; right: 16px; background: #000; color: white; padding: 12px 16px; border-radius: 8px; font-size: 13px; z-index: 9999; }
                .print-hint button { background: white; color: #000; border: none; padding: 8px 16px; margin-left: 12px; border-radius: 4px; cursor: pointer; font-weight: 600; }
            `}</style>

            <div className="print-hint">
                Delivery Note — Ready to print
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
                    <div className="dn-badge">Delivery Note</div>
                    <div className="dn-number">{delivery.delivery_number}</div>
                    <div className="dn-date">Scheduled: {formatDate(delivery.scheduled_date)}</div>
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
                    <div className="section-title">Deliver To</div>
                    {delivery.delivery_site ? (
                        <>
                            <div className="party-name">{delivery.delivery_site.name}</div>
                            {delivery.delivery_site.address_line_1 && <div className="party-detail">{delivery.delivery_site.address_line_1}</div>}
                            {delivery.delivery_site.address_line_2 && <div className="party-detail">{delivery.delivery_site.address_line_2}</div>}
                            {(delivery.delivery_site.city || delivery.delivery_site.postcode) && (
                                <div className="party-detail">
                                    {[delivery.delivery_site.city, delivery.delivery_site.county, delivery.delivery_site.postcode].filter(Boolean).join(', ')}
                                </div>
                            )}
                            {delivery.delivery_site.country && delivery.delivery_site.country !== 'United Kingdom' && (
                                <div className="party-detail">{delivery.delivery_site.country}</div>
                            )}
                        </>
                    ) : (
                        <div className="party-detail" style={{ fontStyle: 'italic', color: '#999' }}>No delivery site specified</div>
                    )}
                    {contactName && <div className="party-detail" style={{ marginTop: '8px' }}>Contact: {contactName}</div>}
                    {contactPhone && <div className="party-detail">Phone: {contactPhone}</div>}
                </div>
            </div>

            {/* Linked Job */}
            {delivery.linked_job && (
                <div className="job-ref">
                    <div className="section-title">Linked Job</div>
                    <div className="job-ref-value">
                        {delivery.linked_job.job_number} &mdash; {delivery.linked_job.client_name}
                    </div>
                </div>
            )}

            {/* Items Table */}
            <table className="items-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Qty</th>
                    </tr>
                </thead>
                <tbody>
                    {delivery.items.map((item, index) => (
                        <tr key={item.id}>
                            <td>{index + 1}</td>
                            <td>{item.description}</td>
                            <td>{item.quantity}</td>
                        </tr>
                    ))}
                    {delivery.items.length === 0 && (
                        <tr>
                            <td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>No items</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Driver Notes */}
            {delivery.notes_driver && (
                <div className="driver-notes">
                    <div className="driver-notes-title">Driver Notes</div>
                    <div className="driver-notes-content">{delivery.notes_driver}</div>
                </div>
            )}

            {/* Signature Lines */}
            <div className="signature-section">
                <div>
                    <div className="signature-line" />
                    <div className="signature-label">Received by: _______________</div>
                </div>
                <div>
                    <div className="signature-line" />
                    <div className="signature-label">Date: _______________</div>
                </div>
            </div>

            {/* Footer */}
            <div className="footer">
                Onesign & Digital &bull; {delivery.delivery_number} &bull; Generated {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
        </div>
    );
}
