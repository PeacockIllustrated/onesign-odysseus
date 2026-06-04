/* eslint-disable @next/next/no-img-element -- print/PDF output uses raw <img>; next/image optimisation doesn't apply to a print route */
import { requireAdmin } from '@/lib/auth';
import { getProductionPack } from '@/lib/production-packs/actions';
import { notFound } from 'next/navigation';
import type { Block, PackCover } from '@/lib/production-packs/types';

const TEAL = '#4e7e8c';

export default async function ProductionPackPrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();
    const { id } = await params;
    const pack = await getProductionPack(id);
    if (!pack) notFound();

    const { cover, sections } = pack.content;
    const wordmark = (cover.showWordmark && cover.clientName) || cover.projectName || pack.title;

    return (
        <div className="pp-root">
            <title>{`${pack.title} — works pack`}</title>
            <style>{styles}</style>

            <div className="pp-hint">
                Works pack — ready to print
                <button id="ppPrint">Print / Save PDF</button>
            </div>
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        (function(){
                            function go(){
                                var b=document.getElementById('ppPrint');
                                if(b) b.onclick=function(){window.print();};
                                if(document.fonts&&document.fonts.ready){
                                    document.fonts.ready.then(function(){setTimeout(function(){window.print();},400);});
                                } else { setTimeout(function(){window.print();},600); }
                            }
                            if(document.readyState==='complete') go();
                            else window.addEventListener('load', go);
                        })();
                    `,
                }}
            />

            {/* COVER */}
            <section className="pp-cover">
                <img src="/Onesign-Logo-Black.svg" alt="Onesign & Digital" className="pp-cover-logo" />
                <div className="pp-cover-mid">
                    {cover.logoUrl && (
                        <img src={cover.logoUrl} alt={cover.clientName || 'client logo'} className="pp-cover-clientlogo" />
                    )}
                    <div className="pp-cover-word">{wordmark}</div>
                    <div className="pp-cover-sub">{cover.subtitle || 'Signage works pack'}</div>
                    {cover.projectName && cover.showWordmark && cover.clientName && (
                        <div className="pp-cover-project">{cover.projectName}</div>
                    )}
                </div>
                <div className="pp-cover-band">
                    <div>
                        {cover.clientName && <div className="pp-cover-band-strong">{cover.clientName}</div>}
                        {cover.siteAddress && <div>{cover.siteAddress}</div>}
                    </div>
                    <div className="pp-cover-band-right">
                        {cover.reference && <div>Ref: {cover.reference}</div>}
                        {cover.revision && <div>Rev: {cover.revision}</div>}
                        {cover.date && <div>{cover.date}</div>}
                    </div>
                </div>
            </section>

            {/* ONE PAGE PER SIGN */}
            {sections.map((section, si) => {
                const hasBreak = section.blocks.some((b) => b.type === 'pageBreak');
                return (
                    <section className={`pp-page${hasBreak ? ' pp-page-flow' : ''}`} key={section.id}>
                        <div className="pp-page-head">
                            {section.signRef && <span className="pp-ref">{section.signRef}</span>}
                            <h2 className="pp-title">{section.title}</h2>
                        </div>

                        <div className="pp-body">
                            {section.blocks.map((block) => (
                                <BlockView key={block.id} block={block} />
                            ))}
                        </div>

                        <TitleBlock cover={cover} page={si + 1} pages={sections.length} />
                    </section>
                );
            })}

            {sections.length === 0 && (
                <section className="pp-page">
                    <p style={{ color: '#999', textAlign: 'center', marginTop: '40mm' }}>
                        This pack has no signs yet.
                    </p>
                </section>
            )}
        </div>
    );
}

function BlockView({ block }: { block: Block }) {
    switch (block.type) {
        case 'heading':
            return block.text ? <h3 className="pp-h">{block.text}</h3> : null;

        case 'text':
            return (
                <div className="pp-text">
                    {block.title && <div className="pp-text-title">{block.title}</div>}
                    {block.body && <p className="pp-text-body">{block.body}</p>}
                </div>
            );

        case 'image':
        case 'visual':
            return block.url ? (
                <figure className="pp-fig" style={{ pageBreakInside: 'avoid' }}>
                    <img
                        src={block.url}
                        alt={block.caption || ''}
                        style={{ width: '100%', height: `${block.height}px`, objectFit: block.fit }}
                    />
                    {block.caption && <figcaption className="pp-cap">{block.caption}</figcaption>}
                </figure>
            ) : null;

        case 'technical':
            return <TechnicalView block={block} />;

        case 'specTable':
            return (
                <div className="pp-spec" style={{ pageBreakInside: 'avoid' }}>
                    {block.title && <div className="pp-block-title">{block.title}</div>}
                    <table className="pp-spec-table">
                        <tbody>
                            {block.rows
                                .filter((r) => r.label || r.value)
                                .map((r, i) => (
                                    <tr key={i}>
                                        <th>{r.label}</th>
                                        <td>{r.value}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            );

        case 'callouts':
            return (
                <div className="pp-callouts" style={{ pageBreakInside: 'avoid' }}>
                    {block.title && <div className="pp-block-title">{block.title}</div>}
                    <ul>
                        {block.items
                            .filter(Boolean)
                            .map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                    </ul>
                </div>
            );

        case 'stages':
            return (
                <div className="pp-stages" style={{ pageBreakInside: 'avoid' }}>
                    {block.title && <div className="pp-block-title">{block.title}</div>}
                    <table className="pp-stages-table">
                        <tbody>
                            {block.stages
                                .filter((s) => s.name || s.instructions)
                                .map((s, i) => (
                                    <tr key={i}>
                                        <td className="pp-tick-cell">
                                            <span className={`pp-tick ${s.done ? 'done' : ''}`}>{s.done ? '✓' : ''}</span>
                                        </td>
                                        <th>{s.name}</th>
                                        <td className="pp-stage-instr">{s.instructions}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            );

        case 'qc':
            return (
                <div className="pp-qc" style={{ pageBreakInside: 'avoid' }}>
                    {block.title && <div className="pp-block-title">{block.title}</div>}
                    <div className="pp-qc-row">
                        {block.checks
                            .filter((c) => c.label)
                            .map((c, i) => (
                                <div className="pp-qc-item" key={i}>
                                    <span className={`pp-tick ${c.done ? 'done' : ''}`}>{c.done ? '✓' : ''}</span>
                                    <span>{c.label}</span>
                                </div>
                            ))}
                    </div>
                </div>
            );

        case 'pageBreak':
            return <div className="pp-pagebreak" />;
    }
}

function TechnicalView({ block }: { block: Extract<Block, { type: 'technical' }> }) {
    if (!block.url) return null;
    const showDims = block.showDimensions && block.widthMm != null;
    const frame = (
        <div className="pp-tech-frame" style={{ height: `${block.height}px` }}>
            <img src={block.url} alt={block.caption || 'technical drawing'} />
        </div>
    );
    return (
        <figure className="pp-tech" style={{ pageBreakInside: 'avoid' }}>
            {showDims ? (
                <div className="pp-tech-grid">
                    {block.heightMm != null ? <DimV mm={block.heightMm} /> : <div />}
                    {frame}
                    <div />
                    <DimH mm={block.widthMm as number} />
                </div>
            ) : (
                frame
            )}
            {block.caption && <figcaption className="pp-cap">{block.caption}</figcaption>}
        </figure>
    );
}

function DimH({ mm }: { mm: number }) {
    return (
        <div className="pp-dim pp-dim-h">
            <span className="pp-dim-line-h" />
            <span className="pp-dim-tick-h" style={{ left: 0 }} />
            <span className="pp-dim-tick-h" style={{ right: 0 }} />
            <span className="pp-dim-chip">{mm} mm</span>
        </div>
    );
}

function DimV({ mm }: { mm: number }) {
    return (
        <div className="pp-dim pp-dim-v">
            <span className="pp-dim-line-v" />
            <span className="pp-dim-tick-v" style={{ top: 0 }} />
            <span className="pp-dim-tick-v" style={{ bottom: 0 }} />
            <span className="pp-dim-chip pp-dim-chip-v">{mm} mm</span>
        </div>
    );
}

function TitleBlock({ cover, page, pages }: { cover: PackCover; page: number; pages: number }) {
    const fields: Array<[string, string]> = [
        ['Client', cover.clientName],
        ['Project', cover.projectName],
        ['Drawn by', cover.drawnBy],
        ['Checked by', cover.checkedBy],
        ['Date', cover.date],
        ['Ref', cover.reference],
        ['Rev', cover.revision],
    ];
    return (
        <div className="pp-titleblock">
            <div className="pp-tb-brand">
                <img src="/Onesign-Logo-Black.svg" alt="Onesign & Digital" className="pp-tb-logo" />
                <div className="pp-tb-tag">Signage works pack</div>
            </div>
            <div className="pp-tb-fields">
                {fields.map(([label, value]) => (
                    <div className="pp-tb-field" key={label}>
                        <span className="pp-tb-label">{label}</span>
                        <span className="pp-tb-value">{value || '—'}</span>
                    </div>
                ))}
            </div>
            <div className="pp-tb-page">
                {page} / {pages}
            </div>
        </div>
    );
}

const styles = `
@media print {
    @page { size: A4; margin: 12mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pp-hint { display: none !important; }
    .pp-cover, .pp-page { page-break-after: always; }
    .pp-page:last-child, .pp-cover:last-child { page-break-after: auto; }
}
.pp-root { font-family: 'Gilroy', system-ui, sans-serif; color: #1a1a1a; background: #fff; }
.pp-hint { position: fixed; top: 16px; right: 16px; background: #000; color: #fff; padding: 12px 16px; border-radius: 8px; font-size: 13px; z-index: 9999; }
.pp-hint button { background: #fff; color: #000; border: none; padding: 8px 16px; margin-left: 12px; border-radius: 4px; cursor: pointer; font-weight: 600; }

/* page frame */
.pp-cover, .pp-page {
    width: 186mm; min-height: 273mm; margin: 0 auto;
    display: flex; flex-direction: column;
    padding: 0; box-sizing: border-box;
}
@media screen {
    .pp-cover, .pp-page { box-shadow: 0 1px 8px rgba(0,0,0,0.12); margin: 16px auto; padding: 14mm; background: #fff; }
    .pp-root { background: #f3f4f6; padding: 8px 0 40px; }
}
@media print { .pp-cover, .pp-page { padding: 0; } }

/* cover */
.pp-cover { justify-content: space-between; }
.pp-cover-logo { height: 26px; width: auto; }
.pp-cover-mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.pp-cover-word { font-size: 52px; font-weight: 900; letter-spacing: -0.01em; line-height: 1.02; text-transform: uppercase; color: #1a1a1a; }
.pp-cover-sub { margin-top: 14px; font-size: 18px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: ${TEAL}; }
.pp-cover-project { margin-top: 10px; font-size: 15px; color: #666; }
.pp-cover-band { background: ${TEAL}; color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; line-height: 1.5; }
.pp-cover-band-strong { font-weight: 700; font-size: 13px; }
.pp-cover-band-right { text-align: right; }

/* page head */
.pp-page-head { border-bottom: 2px solid ${TEAL}; padding-bottom: 8px; margin-bottom: 12px; }
.pp-ref { display: inline-block; background: ${TEAL}; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 2px; }
.pp-title { font-size: 22px; font-weight: 800; margin: 6px 0 0; }

/* body */
.pp-body { flex: 1; display: flex; flex-direction: column; gap: 12px; }

/* Manual page break. Sections containing one switch to normal block flow so
   the forced break is honoured (flex containers don't fragment reliably). */
.pp-pagebreak { break-before: page; page-break-before: always; height: 0; }
.pp-page-flow { display: block; }
.pp-page-flow .pp-body { display: block; }
.pp-page-flow .pp-body > * { margin-bottom: 12px; }
.pp-page-flow .pp-titleblock { margin-top: 16px; }
.pp-h { font-size: 15px; font-weight: 800; margin: 4px 0 0; }
.pp-block-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${TEAL}; margin-bottom: 5px; }
.pp-text-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${TEAL}; margin-bottom: 4px; }
.pp-text-body { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; margin: 0; color: #2a2a2a; }

.pp-fig { margin: 0; }
.pp-fig img { display: block; border: 1px solid #e5e5e5; border-radius: 3px; background: #fafafa; }
.pp-cap { font-size: 11px; color: #777; margin-top: 4px; font-style: italic; }

.pp-spec-table { width: 100%; border-collapse: collapse; }
.pp-spec-table th { text-align: left; width: 38%; font-size: 11px; font-weight: 600; color: #555; padding: 6px 10px; background: #f4f7f8; border: 1px solid #e5e5e5; vertical-align: top; }
.pp-spec-table td { font-size: 12px; padding: 6px 10px; border: 1px solid #e5e5e5; vertical-align: top; }

.pp-callouts ul { margin: 0; padding-left: 0; list-style: none; }
.pp-callouts li { font-size: 12px; line-height: 1.5; padding-left: 16px; position: relative; margin-bottom: 3px; }
.pp-callouts li::before { content: ''; position: absolute; left: 2px; top: 7px; width: 6px; height: 6px; background: ${TEAL}; border-radius: 1px; }

.pp-stages-table { width: 100%; border-collapse: collapse; }
.pp-stages-table th { text-align: left; font-size: 12px; font-weight: 700; padding: 5px 8px; white-space: nowrap; border-bottom: 1px solid #eee; vertical-align: top; width: 1%; }
.pp-stages-table td { font-size: 12px; padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
.pp-stage-instr { color: #555; }
.pp-tick-cell { width: 1%; }
.pp-tick { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border: 1.5px solid ${TEAL}; border-radius: 2px; font-size: 11px; line-height: 1; color: #fff; }
.pp-tick.done { background: ${TEAL}; }

.pp-qc-row { display: flex; gap: 22px; flex-wrap: wrap; }
.pp-qc-item { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; }

/* title block */
.pp-titleblock { margin-top: 12px; background: ${TEAL}; color: #fff; display: flex; align-items: center; gap: 14px; padding: 9px 14px; }
.pp-tb-brand { border-right: 1px solid rgba(255,255,255,0.35); padding-right: 14px; }
.pp-tb-name { font-size: 13px; font-weight: 800; }
.pp-tb-tag { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.85; }
.pp-tb-fields { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; }
.pp-tb-field { display: flex; flex-direction: column; line-height: 1.2; }
.pp-tb-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.8; }
.pp-tb-value { font-size: 11px; font-weight: 600; }
.pp-tb-page { font-size: 11px; font-weight: 700; opacity: 0.9; }
.pp-tb-logo { height: 16px; width: auto; display: block; margin-bottom: 3px; filter: brightness(0) invert(1); }

/* cover client logo */
.pp-cover-clientlogo { max-height: 150px; max-width: 78%; width: auto; object-fit: contain; margin-bottom: 20px; }

/* technical drawing + overall dimensions */
.pp-tech { margin: 0; }
.pp-tech-grid { display: grid; grid-template-columns: 24px 1fr; grid-template-rows: auto 24px; }
.pp-tech-frame { border: 1px solid #d3d7d9; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pp-tech-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pp-dim { position: relative; }
.pp-dim-h { height: 24px; }
.pp-dim-line-h { position: absolute; top: 11px; left: 2px; right: 2px; height: 1px; background: ${TEAL}; }
.pp-dim-tick-h { position: absolute; top: 6px; width: 1px; height: 11px; background: ${TEAL}; }
.pp-dim-v { width: 24px; }
.pp-dim-line-v { position: absolute; left: 11px; top: 2px; bottom: 2px; width: 1px; background: ${TEAL}; }
.pp-dim-tick-v { position: absolute; left: 6px; height: 1px; width: 11px; background: ${TEAL}; }
.pp-dim-chip { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 5px; font-size: 9px; font-weight: 700; color: ${TEAL}; white-space: nowrap; }
.pp-dim-chip-v { top: 50%; left: 11px; transform: translate(-50%, -50%) rotate(-90deg); }
`;
