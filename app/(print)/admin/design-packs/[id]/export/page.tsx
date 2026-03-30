import { requireAdmin } from '@/lib/auth';
import { getDesignPack, recordExport } from '@/lib/design-packs/actions';
import { notFound } from 'next/navigation';
import { formatDate } from '@/lib/design-packs/utils';
import { SIGN_TEMPLATE_GENERATORS, SIGN_TEMPLATE_LABELS } from '@/lib/design-packs/sign-templates';

export default async function DesignPackExportPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const pack = await getDesignPack(id);

    if (!pack) {
        notFound();
    }

    // Record export (get version number)
    const result = await recordExport(id);
    const version = 'version' in result ? result.version : 1;

    return (
        <>
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
                    .page-break {
                        page-break-after: always;
                    }
                    .no-print {
                        display: none !important;
                    }
                }

                .print-view-root {
                    font-family: 'Gilroy', system-ui, sans-serif;
                    color: #000;
                    background: #fff;
                    max-width: 210mm;
                    margin: 0 auto;
                    padding: 20px;
                }

                .print-header {
                    border-bottom: 2px solid #000;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }

                .print-section {
                    margin-bottom: 40px;
                }

                .colour-swatch {
                    display: inline-block;
                    width: 80px;
                    height: 80px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    margin-right: 15px;
                }

                .sign-preview {
                    margin: 20px 0;
                    page-break-inside: avoid;
                }
            `}</style>

            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        if (typeof window !== 'undefined') {
                            document.fonts.ready.then(() => {
                                setTimeout(() => {
                                    window.print();
                                }, 500);
                            });
                        }
                    `,
                }}
            />

            <div className="print-view-root">
                {/* Print Hint (no-print) */}
                <div className="no-print" style={{ marginBottom: '30px', padding: '20px', background: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
                    <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '10px' }}>
                        ready to save as pdf
                    </p>
                    <p style={{ fontSize: '14px', color: '#666' }}>
                        use your browser's print dialog (ctrl/cmd + p) to save as pdf
                    </p>
                </div>

                {/* Cover Page */}
                <div className="page-break">
                    <div style={{ height: '250mm', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                        <h1 style={{ fontSize: '48px', fontWeight: '700', marginBottom: '20px', textTransform: 'lowercase' }}>
                            {pack.project_name}
                        </h1>
                        <p style={{ fontSize: '24px', color: '#666', marginBottom: '40px', textTransform: 'lowercase' }}>
                            design pack
                        </p>
                        <div style={{ fontSize: '14px', color: '#999' }}>
                            <p>prepared for: {pack.client_name}</p>
                            {pack.client_email && <p>{pack.client_email}</p>}
                            <p style={{ marginTop: '20px' }}>generated: {formatDate(new Date().toISOString())}</p>
                            <p>version: {version}</p>
                        </div>
                        <div style={{ position: 'absolute', bottom: '40px', width: '100%', textAlign: 'center', fontSize: '12px', color: '#999' }}>
                            <p>environmental signage design</p>
                        </div>
                    </div>
                </div>

                {/* Typography Section */}
                {pack.data_json.typography && (
                    <div className="page-break">
                        <div className="print-header">
                            <h2 style={{ fontSize: '32px', fontWeight: '700', margin: '0', textTransform: 'lowercase' }}>
                                typography
                            </h2>
                        </div>

                        <div className="print-section">
                            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', textTransform: 'lowercase' }}>
                                primary font (headings & wayfinding)
                            </h3>
                            <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
                                {pack.data_json.typography.primary_font.family} • {pack.data_json.typography.primary_font.weight}
                            </p>
                            <div style={{ fontFamily: `"${pack.data_json.typography.primary_font.family}", sans-serif`, fontWeight: pack.data_json.typography.primary_font.weight }}>
                                <p style={{ fontSize: '72px', lineHeight: '1.2', margin: '20px 0' }}>visitor centre</p>
                                <p style={{ fontSize: '48px', lineHeight: '1.2', margin: '20px 0' }}>main entrance</p>
                                <p style={{ fontSize: '32px', lineHeight: '1.2', margin: '20px 0' }}>200 metres ahead</p>
                            </div>
                        </div>

                        <div className="print-section">
                            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', textTransform: 'lowercase' }}>
                                secondary font (body & information)
                            </h3>
                            <p style={{ fontSize: '16px', color: '#666', marginBottom: '20px' }}>
                                {pack.data_json.typography.secondary_font.family} • {pack.data_json.typography.secondary_font.weight}
                            </p>
                            <div style={{ fontFamily: `"${pack.data_json.typography.secondary_font.family}", sans-serif`, fontWeight: pack.data_json.typography.secondary_font.weight }}>
                                <p style={{ fontSize: '16px', lineHeight: '1.6' }}>
                                    this historic woodland has been managed for over 400 years, providing habitats for numerous species of wildlife. visitors can explore miles of walking trails through ancient oak and beech forests.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Colour Palette Section */}
                {pack.data_json.colours && (
                    <div className="page-break">
                        <div className="print-header">
                            <h2 style={{ fontSize: '32px', fontWeight: '700', margin: '0', textTransform: 'lowercase' }}>
                                colour palette
                            </h2>
                        </div>

                        <div className="print-section">
                            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', textTransform: 'lowercase' }}>
                                brand colours
                            </h3>
                            <div style={{ display: 'flex', gap: '30px', marginBottom: '30px' }}>
                                <div>
                                    <div className="colour-swatch" style={{ backgroundColor: pack.data_json.colours.primary.hex }} />
                                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '10px 0 5px 0' }}>
                                        {pack.data_json.colours.primary.name}
                                    </p>
                                    <p style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                                        {pack.data_json.colours.primary.hex}
                                    </p>
                                    {pack.data_json.colours.primary.wcag_contrast_ratio && (
                                        <p style={{ fontSize: '11px', color: '#999' }}>
                                            contrast: {pack.data_json.colours.primary.wcag_contrast_ratio}:1
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <div className="colour-swatch" style={{ backgroundColor: pack.data_json.colours.secondary.hex, border: '2px solid #ddd' }} />
                                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '10px 0 5px 0' }}>
                                        {pack.data_json.colours.secondary.name}
                                    </p>
                                    <p style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                                        {pack.data_json.colours.secondary.hex}
                                    </p>
                                </div>
                            </div>

                            {pack.data_json.colours.accents.length > 0 && (
                                <>
                                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginTop: '40px', marginBottom: '20px', textTransform: 'lowercase' }}>
                                        accent colours
                                    </h3>
                                    <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                                        {pack.data_json.colours.accents.map((accent, idx) => (
                                            <div key={idx}>
                                                <div className="colour-swatch" style={{ backgroundColor: accent.hex }} />
                                                <p style={{ fontSize: '14px', fontWeight: '600', margin: '10px 0 5px 0' }}>
                                                    {accent.name}
                                                </p>
                                                <p style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                                                    {accent.hex}
                                                </p>
                                                {accent.wcag_contrast_ratio && (
                                                    <p style={{ fontSize: '11px', color: '#999' }}>
                                                        contrast: {accent.wcag_contrast_ratio}:1
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Graphic Style & Materials */}
                <div className="page-break">
                    {pack.data_json.graphic_style && (
                        <div className="print-section">
                            <div className="print-header">
                                <h2 style={{ fontSize: '32px', fontWeight: '700', margin: '0', textTransform: 'lowercase' }}>
                                    graphic style
                                </h2>
                            </div>
                            <p style={{ fontSize: '18px', marginBottom: '10px' }}>
                                icon family: <strong>{pack.data_json.graphic_style.icon_family}</strong>
                            </p>
                            {pack.data_json.graphic_style.pattern_style && pack.data_json.graphic_style.pattern_style !== 'none' && (
                                <p style={{ fontSize: '18px' }}>
                                    background pattern: <strong>{pack.data_json.graphic_style.pattern_style}</strong>
                                </p>
                            )}
                        </div>
                    )}

                    {pack.data_json.materials && (
                        <div className="print-section" style={{ marginTop: '60px' }}>
                            <div className="print-header">
                                <h2 style={{ fontSize: '32px', fontWeight: '700', margin: '0', textTransform: 'lowercase' }}>
                                    materials & finishes
                                </h2>
                            </div>
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', textTransform: 'lowercase' }}>
                                    substrate
                                </h3>
                                <p style={{ fontSize: '24px', fontWeight: '700' }}>{pack.data_json.materials.substrate}</p>
                            </div>
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '10px', textTransform: 'lowercase' }}>
                                    finish
                                </h3>
                                <p style={{ fontSize: '24px', fontWeight: '700' }}>{pack.data_json.materials.finish}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sign Previews */}
                {pack.data_json.typography && pack.data_json.colours && (
                    <>
                        <div className="page-break">
                            <div className="print-header">
                                <h2 style={{ fontSize: '32px', fontWeight: '700', margin: '0', textTransform: 'lowercase' }}>
                                    sign previews
                                </h2>
                            </div>

                            <div className="sign-preview">
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', textTransform: 'lowercase' }}>
                                    {SIGN_TEMPLATE_LABELS.entrance}
                                </h3>
                                <div dangerouslySetInnerHTML={{ __html: SIGN_TEMPLATE_GENERATORS.entrance(pack.data_json, pack.project_name) }} />
                            </div>
                        </div>

                        <div className="page-break">
                            <div className="sign-preview">
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', textTransform: 'lowercase' }}>
                                    {SIGN_TEMPLATE_LABELS.wayfinding}
                                </h3>
                                <div dangerouslySetInnerHTML={{ __html: SIGN_TEMPLATE_GENERATORS.wayfinding(pack.data_json) }} />
                            </div>

                            <div className="sign-preview">
                                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', textTransform: 'lowercase' }}>
                                    {SIGN_TEMPLATE_LABELS.info_board}
                                </h3>
                                <div dangerouslySetInnerHTML={{ __html: SIGN_TEMPLATE_GENERATORS.info_board(pack.data_json) }} />
                            </div>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid #ddd', fontSize: '12px', color: '#999', textAlign: 'center' }}>
                    <p>environmental signage design pack</p>
                    <p>{formatDate(new Date().toISOString())} • version {version}</p>
                </div>
            </div>
        </>
    );
}
