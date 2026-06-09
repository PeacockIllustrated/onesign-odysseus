import { requireAdmin } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { getSurveyDetail } from '@/lib/site-surveys/queries';
import { buildSurveySketch } from '@/lib/site-surveys/sketch';
import { buildPhotoSvg } from '@/lib/site-surveys/annotation-svg';
import {
    CONDITION_FLAGS,
    type Measurements,
    type SurveyConditions,
    type SurveyItemRow,
    type SurveyPhotoWithUrl,
} from '@/lib/site-surveys/types';

export const dynamic = 'force-dynamic';

function formatDate(d: string | null): string {
    if (!d) return '—';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function measurementRows(m: Measurements): { label: string; value: string }[] {
    const rows: { label: string; value: string }[] = [];
    const push = (label: string, v: number | undefined) => {
        if (v !== undefined) rows.push({ label, value: `${Math.round(v)} mm` });
    };
    push('Width', m.width_mm);
    push('Height', m.height_mm);
    push('Depth', m.depth_mm);
    push('Return depth', m.return_depth_mm);
    push('Shadow gap', m.shadow_gap_mm);
    for (const e of m.extra ?? [])
        rows.push({ label: e.label, value: `${Math.round(e.value_mm)} mm` });
    return rows;
}

function itemFlags(it: SurveyItemRow): string[] {
    const f: string[] = [];
    if (it.has_returns) f.push('Returns');
    if (it.shadow_gap_required) f.push('Shadow gap');
    if (it.new_fascia_required) f.push('New fascia');
    if (it.illuminated) f.push('Illuminated');
    return f;
}

function PhotoBlock({ photo }: { photo: SurveyPhotoWithUrl }) {
    if (!photo.url) return null;
    const w = photo.width_px ?? 0;
    const h = photo.height_px ?? 0;
    const inner =
        w > 0 && h > 0
            ? buildPhotoSvg(photo.url, photo.annotations_json ?? [], w, h)
            : `<img src="${photo.url}" style="width:100%;height:auto;display:block" alt="survey photo" />`;
    return (
        <div className="photo">
            <div dangerouslySetInnerHTML={{ __html: inner }} />
            {photo.caption && <p className="photo-cap">{photo.caption}</p>}
        </div>
    );
}

export default async function SurveyPackPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const detail = await getSurveyDetail(id);
    if (!detail) notFound();

    const { survey, items, photos } = detail;
    const conditions: SurveyConditions = survey.conditions_json ?? {};
    const clientName = detail.org_name ?? survey.client_name ?? '—';
    const siteName = detail.site_name ?? survey.site_address ?? '—';
    const generalPhotos = photos.filter((p) => !p.item_id);

    return (
        <>
            <style>{`
                @media print {
                    @page { margin: 14mm; size: A4; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .page-break { page-break-after: always; }
                    .no-print { display: none !important; }
                    .avoid-break { page-break-inside: avoid; }
                }
                .pack { font-family: 'Gilroy', system-ui, sans-serif; color: #111; background: #fff; max-width: 210mm; margin: 0 auto; padding: 18px; }
                .pack h1 { font-size: 30px; font-weight: 700; margin: 0; }
                .pack h2 { font-size: 18px; font-weight: 700; margin: 0 0 10px; }
                .muted { color: #6b7280; }
                .rule { border: 0; border-top: 2px solid #111; margin: 14px 0; }
                .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
                .kv { font-size: 13px; }
                .kv .k { color: #6b7280; margin-right: 6px; }
                .chip { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #eef2f7; color: #111; margin: 0 6px 6px 0; }
                .chip.on { background: #111; color: #fff; }
                .chip.off { background: #f3f4f6; color: #9ca3af; }
                .item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
                .item-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
                .item-head .n { font-weight: 700; }
                .item-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
                table.meas { width: 100%; border-collapse: collapse; font-size: 13px; }
                table.meas td { padding: 4px 0; border-bottom: 1px dotted #e5e7eb; }
                table.meas td.v { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
                .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
                .photo { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
                .photo-cap { font-size: 11px; color: #6b7280; padding: 4px 8px; margin: 0; }
                .notes { white-space: pre-wrap; font-size: 13px; }
                .section { margin-bottom: 22px; }
            `}</style>

            <script
                dangerouslySetInnerHTML={{
                    __html: `if (typeof window !== 'undefined') { window.addEventListener('load', () => setTimeout(() => window.print(), 600)); }`,
                }}
            />

            <div className="pack">
                <div
                    className="no-print"
                    style={{
                        marginBottom: 18,
                        padding: 14,
                        background: '#f5f5f5',
                        borderRadius: 8,
                        textAlign: 'center',
                        fontSize: 13,
                        color: '#666',
                    }}
                >
                    use your browser&apos;s print dialog (ctrl/cmd + p) to save this survey
                    pack as pdf
                </div>

                {/* Header */}
                <div className="section">
                    <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                        Site survey · {survey.reference}
                    </p>
                    <h1>{survey.title || 'Site survey'}</h1>
                    <hr className="rule" />
                    <div className="grid2">
                        <div className="kv">
                            <span className="k">Client</span>
                            {clientName}
                        </div>
                        <div className="kv">
                            <span className="k">Date</span>
                            {formatDate(survey.survey_date)}
                        </div>
                        <div className="kv">
                            <span className="k">Site</span>
                            {siteName}
                        </div>
                        <div className="kv">
                            <span className="k">Contact</span>
                            {detail.contact_name ?? '—'}
                        </div>
                    </div>
                </div>

                {/* Access & build conditions */}
                <div className="section avoid-break">
                    <h2>Access &amp; build conditions</h2>
                    <div>
                        {CONDITION_FLAGS.map(({ key, label }) => (
                            <span
                                key={key}
                                className={`chip ${conditions[key] ? 'on' : 'off'}`}
                            >
                                {conditions[key] ? '✓ ' : '○ '}
                                {label}
                            </span>
                        ))}
                    </div>
                    {(conditions.access_notes || conditions.parking_notes) && (
                        <div className="grid2" style={{ marginTop: 10 }}>
                            {conditions.access_notes && (
                                <div className="kv">
                                    <span className="k">Access</span>
                                    {conditions.access_notes}
                                </div>
                            )}
                            {conditions.parking_notes && (
                                <div className="kv">
                                    <span className="k">Parking / loading</span>
                                    {conditions.parking_notes}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Items */}
                <div className="section">
                    <h2>Measured items</h2>
                    {items.length === 0 && (
                        <p className="muted" style={{ fontSize: 13 }}>
                            No items recorded.
                        </p>
                    )}
                    {items.map((it, i) => {
                        const rows = measurementRows(it.measurements_json ?? {});
                        const flags = itemFlags(it);
                        const itemPhotos = photos.filter((p) => p.item_id === it.id);
                        const sketch = buildSurveySketch(it.measurements_json ?? {}, {
                            hasReturns: it.has_returns,
                            shadowGap: it.shadow_gap_required,
                            title: it.label,
                        });
                        return (
                            <div key={it.id} className="item avoid-break">
                                <div className="item-head">
                                    <span className="n">{i + 1}. {it.label}</span>
                                    {it.sign_type && (
                                        <span className="muted" style={{ fontSize: 13 }}>
                                            · {it.sign_type}
                                        </span>
                                    )}
                                </div>
                                <div className="item-grid">
                                    <div dangerouslySetInnerHTML={{ __html: sketch }} />
                                    <div>
                                        {rows.length > 0 ? (
                                            <table className="meas">
                                                <tbody>
                                                    {rows.map((r, j) => (
                                                        <tr key={j}>
                                                            <td>{r.label}</td>
                                                            <td className="v">{r.value}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <p className="muted" style={{ fontSize: 13 }}>
                                                No dimensions recorded.
                                            </p>
                                        )}
                                        {flags.length > 0 && (
                                            <div style={{ marginTop: 10 }}>
                                                {flags.map((f) => (
                                                    <span key={f} className="chip on">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {it.fixing_substrate && (
                                            <div className="kv" style={{ marginTop: 8 }}>
                                                <span className="k">Substrate</span>
                                                {it.fixing_substrate}
                                            </div>
                                        )}
                                        {it.item_notes && (
                                            <p
                                                className="notes"
                                                style={{ marginTop: 8 }}
                                            >
                                                {it.item_notes}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {itemPhotos.length > 0 && (
                                    <div className="photos">
                                        {itemPhotos.map((p) => (
                                            <PhotoBlock key={p.id} photo={p} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* General site photos */}
                {generalPhotos.length > 0 && (
                    <div className="section">
                        <h2>Site photos</h2>
                        <div className="photos">
                            {generalPhotos.map((p) => (
                                <PhotoBlock key={p.id} photo={p} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Notes */}
                {survey.notes && (
                    <div className="section avoid-break">
                        <h2>Survey notes</h2>
                        <p className="notes">{survey.notes}</p>
                    </div>
                )}

                <hr className="rule" />
                <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
                    {survey.reference} · prepared {formatDate(new Date().toISOString())} ·
                    Onesign &amp; Digital
                </p>
            </div>
        </>
    );
}
