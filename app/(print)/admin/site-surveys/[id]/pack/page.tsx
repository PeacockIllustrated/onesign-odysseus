import { requireAdmin } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { getSurveyDetail } from '@/lib/site-surveys/queries';
import { buildPhotoSvg } from '@/lib/site-surveys/annotation-svg';
import {
    CONDITION_FLAGS,
    type SurveyConditions,
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

function sizeLabel(p: SurveyPhotoWithUrl): string | null {
    if (p.sign_width_mm != null && p.sign_height_mm != null)
        return `${Math.round(p.sign_width_mm)} × ${Math.round(p.sign_height_mm)} mm`;
    if (p.sign_width_mm != null) return `${Math.round(p.sign_width_mm)} mm wide`;
    if (p.sign_height_mm != null) return `${Math.round(p.sign_height_mm)} mm tall`;
    return null;
}

function PhotoBlock({ photo, n }: { photo: SurveyPhotoWithUrl; n: number }) {
    if (!photo.url) return null;
    const w = photo.width_px ?? 0;
    const h = photo.height_px ?? 0;
    const inner =
        w > 0 && h > 0
            ? buildPhotoSvg(photo.url, photo.annotations_json ?? [], w, h)
            : `<img src="${photo.url}" style="width:100%;height:auto;display:block" alt="survey photo" />`;
    const size = sizeLabel(photo);
    return (
        <div className="photo avoid-break">
            <div className="photo-img" dangerouslySetInnerHTML={{ __html: inner }} />
            <div className="photo-meta">
                <span>
                    <strong>{n}.</strong> {photo.caption || 'Photo'}
                </span>
                {size && <span className="photo-size">{size}</span>}
            </div>
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

    const { survey, photos } = detail;
    const conditions: SurveyConditions = survey.conditions_json ?? {};
    const clientName = detail.org_name ?? survey.client_name ?? '—';
    const flagged = CONDITION_FLAGS.filter(({ key }) => conditions[key]);

    return (
        <>
            <style>{`
                @media print {
                    @page { margin: 14mm; size: A4; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .avoid-break { page-break-inside: avoid; }
                }
                .pack { font-family: 'Gilroy', system-ui, sans-serif; color: #111; background: #fff; max-width: 210mm; margin: 0 auto; padding: 18px; }
                .pack h1 { font-size: 28px; font-weight: 700; margin: 0; }
                .pack h2 { font-size: 16px; font-weight: 700; margin: 0 0 10px; }
                .muted { color: #6b7280; }
                .rule { border: 0; border-top: 2px solid #4e7e8c; margin: 14px 0; }
                .eyebrow { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #4e7e8c; }
                .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
                .kv { font-size: 13px; } .kv .k { color: #6b7280; margin-right: 6px; }
                .chip { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: #4e7e8c; color: #fff; margin: 0 6px 6px 0; }
                .section { margin-bottom: 22px; }
                .photo { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
                .photo-img { max-width: 560px; margin: 0 auto; }
                .photo-meta { display: flex; justify-content: space-between; gap: 8px; padding: 6px 10px; font-size: 12px; border-top: 1px solid #f0f0f0; }
                .photo-size { font-weight: 700; color: #3a5f6a; white-space: nowrap; }
                .notes { white-space: pre-wrap; font-size: 13px; }
            `}</style>

            <script
                dangerouslySetInnerHTML={{
                    __html: `if (typeof window !== 'undefined') { window.addEventListener('load', () => setTimeout(() => window.print(), 700)); }`,
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
                    <p className="eyebrow">Site survey · {survey.reference}</p>
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
                        {survey.site_address && (
                            <div className="kv">
                                <span className="k">Site</span>
                                {survey.site_address}
                            </div>
                        )}
                    </div>
                </div>

                {/* Conditions */}
                {flagged.length > 0 && (
                    <div className="section avoid-break">
                        <h2>Access &amp; build notes</h2>
                        <div>
                            {flagged.map(({ key, label }) => (
                                <span key={key} className="chip">
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Photos */}
                <div className="section">
                    <h2>Photos &amp; measurements</h2>
                    {photos.length === 0 ? (
                        <p className="muted" style={{ fontSize: 13 }}>
                            No photos recorded.
                        </p>
                    ) : (
                        photos.map((p, i) => (
                            <PhotoBlock key={p.id} photo={p} n={i + 1} />
                        ))
                    )}
                </div>

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
