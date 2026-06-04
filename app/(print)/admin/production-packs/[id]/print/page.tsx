/* eslint-disable @next/next/no-img-element -- print/PDF output uses raw <img>; next/image optimisation doesn't apply to a print route */
import { requireAdmin } from '@/lib/auth';
import { getProductionPack } from '@/lib/production-packs/actions';
import { notFound } from 'next/navigation';
import type { Block, PackCover, PackStyle, SignSection } from '@/lib/production-packs/types';

// =============================================================================
// PRINT THEMES — one per pack style (see PACK_STYLES in lib/production-packs)
// =============================================================================

interface Theme {
    orient: 'portrait' | 'landscape';
    accent: string;
    ink: string;
    coverBg: string;
    coverInk: string;
    coverSub: string;
    bandBg: string;
    bandInk: string;
    titleBlock: 'band' | 'rule';
    coverDark: boolean;
    /** 'standard' = shared single-column layout; 'studio' = designed landscape sheet. */
    layout: 'standard' | 'studio';
}

const THEMES: Record<PackStyle, Theme> = {
    steel: {
        orient: 'portrait', accent: '#4e7e8c', ink: '#1a1a1a',
        coverBg: '#ffffff', coverInk: '#1a1a1a', coverSub: '#4e7e8c',
        bandBg: '#4e7e8c', bandInk: '#ffffff', titleBlock: 'band', coverDark: false, layout: 'standard',
    },
    landscape: {
        orient: 'landscape', accent: '#4e7e8c', ink: '#1a1a1a',
        coverBg: '#ffffff', coverInk: '#1a1a1a', coverSub: '#4e7e8c',
        bandBg: '#4e7e8c', bandInk: '#ffffff', titleBlock: 'band', coverDark: false, layout: 'standard',
    },
    editorial: {
        orient: 'portrait', accent: '#3a5f6a', ink: '#1f2937',
        coverBg: '#1a1f23', coverInk: '#ffffff', coverSub: '#9cc3cd',
        bandBg: '#3a5f6a', bandInk: '#ffffff', titleBlock: 'rule', coverDark: true, layout: 'standard',
    },
    mono: {
        orient: 'portrait', accent: '#1a1a1a', ink: '#1a1a1a',
        coverBg: '#ffffff', coverInk: '#111111', coverSub: '#4e7e8c',
        bandBg: '#1a1a1a', bandInk: '#ffffff', titleBlock: 'band', coverDark: false, layout: 'standard',
    },
    studio: {
        orient: 'landscape', accent: '#4e7e8c', ink: '#1f2937',
        coverBg: '#ffffff', coverInk: '#10242b', coverSub: '#4e7e8c',
        bandBg: '#4e7e8c', bandInk: '#ffffff', titleBlock: 'rule', coverDark: false, layout: 'studio',
    },
};

export default async function ProductionPackPrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();
    const { id } = await params;
    const pack = await getProductionPack(id);
    if (!pack) notFound();

    const { cover, sections, style } = pack.content;
    const theme = THEMES[style] ?? THEMES.steel;
    const wordmark = (cover.showWordmark && cover.clientName) || cover.projectName || pack.title;
    const isStudio = theme.layout === 'studio';

    return (
        <div
            className="pp-root"
            data-orient={theme.orient}
            data-tb={theme.titleBlock}
            data-cover={theme.coverDark ? 'dark' : 'light'}
        >
            <title>{`${pack.title} — works pack`}</title>
            <style>{buildStyles(theme)}</style>

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
            {isStudio ? (
                <StudioCover cover={cover} wordmark={wordmark} />
            ) : (
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
            )}

            {/* ONE PAGE PER SIGN */}
            {isStudio
                ? sections.map((section, si) => (
                      <StudioSheet
                          key={section.id}
                          section={section}
                          cover={cover}
                          page={si + 1}
                          pages={sections.length}
                      />
                  ))
                : sections.map((section, si) => {
                      const hasBreak = section.blocks.some((b) => b.type === 'pageBreak');
                      const needsFlow = hasBreak || section.keepWith.length > 0;
                      const groups = groupBlocks(section.blocks, section.keepWith);
                      return (
                          <section className={`pp-page${needsFlow ? ' pp-page-flow' : ''}`} key={section.id}>
                              <div className="pp-page-head">
                                  {section.signRef && <span className="pp-ref">{section.signRef}</span>}
                                  <h2 className="pp-title">{section.title}</h2>
                              </div>

                              <div className="pp-body">
                                  {groups.map((group, gi) =>
                                      group.length > 1 ? (
                                          <div className="pp-keep" key={gi}>
                                              {group.map((block) => (
                                                  <BlockView key={block.id} block={block} />
                                              ))}
                                          </div>
                                      ) : (
                                          <BlockView key={group[0].id} block={group[0]} />
                                      ),
                                  )}
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

/** Group consecutive blocks joined by keep-with links so the print view can
 *  wrap each run in a break-inside:avoid container. A page break always ends a
 *  run (you can't keep across an explicit break). */
function groupBlocks(blocks: Block[], keepWith: string[]): Block[][] {
    const groups: Block[][] = [];
    let cur: Block[] = [];
    for (let i = 0; i < blocks.length; i++) {
        cur.push(blocks[i]);
        const joinNext =
            i < blocks.length - 1 &&
            keepWith.includes(blocks[i].id) &&
            blocks[i].type !== 'pageBreak' &&
            blocks[i + 1].type !== 'pageBreak';
        if (!joinNext) {
            groups.push(cur);
            cur = [];
        }
    }
    if (cur.length) groups.push(cur);
    return groups;
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

// =============================================================================
// STUDIO LAYOUT — designed landscape "drawing sheet"
// =============================================================================

/** Visual artwork goes on the right "stage"; everything else in the left rail. */
function isStageBlock(b: Block): boolean {
    return b.type === 'visual' || b.type === 'image' || b.type === 'technical';
}

function StudioCover({ cover, wordmark }: { cover: PackCover; wordmark: string }) {
    return (
        <section className="pp-cover pp-studio-cover">
            <div className="pp-studio-cover-inner">
                <div className="pp-studio-cover-top">
                    <img src="/Onesign-Logo-Black.svg" alt="Onesign & Digital" className="pp-cover-logo" />
                    <span className="pp-studio-kicker">Signage works pack</span>
                </div>
                <div className="pp-studio-cover-mid">
                    <div className="pp-studio-eyebrow">{cover.subtitle || 'Signage concept & works'}</div>
                    {cover.logoUrl && (
                        <img src={cover.logoUrl} alt={cover.clientName || ''} className="pp-studio-clientlogo" />
                    )}
                    <div className="pp-studio-word">{wordmark}</div>
                    {cover.projectName && cover.showWordmark && cover.clientName && (
                        <div className="pp-studio-project">{cover.projectName}</div>
                    )}
                </div>
                <div className="pp-studio-cover-foot">
                    <div className="pp-studio-foot-l">
                        {cover.clientName && <span className="pp-studio-foot-strong">{cover.clientName}</span>}
                        {cover.siteAddress && <span>{cover.siteAddress}</span>}
                    </div>
                    <div className="pp-studio-foot-r">
                        {cover.reference && <span>Ref · {cover.reference}</span>}
                        {cover.revision && <span>Rev · {cover.revision}</span>}
                        {cover.date && <span>{cover.date}</span>}
                    </div>
                </div>
            </div>
        </section>
    );
}

function StudioSheet({
    section,
    cover,
    page,
    pages,
}: {
    section: SignSection;
    cover: PackCover;
    page: number;
    pages: number;
}) {
    const stage = section.blocks.filter(isStageBlock);
    const rail = section.blocks.filter((b) => !isStageBlock(b) && b.type !== 'pageBreak');
    return (
        <section className="pp-page pp-studio-sheet">
            <header className="pp-studio-head">
                {section.signRef && <span className="pp-studio-num">{section.signRef}</span>}
                <h2 className="pp-studio-title">{section.title}</h2>
                <span className="pp-studio-headmeta">Onesign &amp; Digital · {page} / {pages}</span>
            </header>
            <div className="pp-studio-grid">
                <div className="pp-studio-rail">
                    {rail.map((b) => (
                        <BlockView key={b.id} block={b} />
                    ))}
                    <StudioTitleBlock cover={cover} />
                </div>
                <div className="pp-studio-stage">
                    {stage.length > 0 ? (
                        stage.map((b) => <BlockView key={b.id} block={b} />)
                    ) : (
                        <div className="pp-studio-empty">Artwork &amp; drawings appear here</div>
                    )}
                </div>
            </div>
        </section>
    );
}

function StudioTitleBlock({ cover }: { cover: PackCover }) {
    const fields: Array<[string, string]> = [
        ['Drawn by', cover.drawnBy],
        ['Checked by', cover.checkedBy],
        ['Date', cover.date],
        ['Rev', cover.revision],
    ];
    return (
        <div className="pp-studio-tb">
            <img src="/Onesign-Logo-Black.svg" alt="Onesign & Digital" className="pp-studio-tb-logo" />
            <div className="pp-studio-tb-fields">
                {fields.map(([l, v]) => (
                    <div key={l} className="pp-studio-tb-field">
                        <span className="pp-studio-tb-label">{l}</span>
                        <span className="pp-studio-tb-value">{v || '—'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function buildStyles(t: Theme): string {
    return `
@media print {
    @page { size: A4 ${t.orient === 'landscape' ? 'landscape' : 'portrait'}; margin: 12mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pp-hint { display: none !important; }
    .pp-cover, .pp-page { page-break-after: always; padding: 0; }
    .pp-page:last-child, .pp-cover:last-child { page-break-after: auto; }
}
.pp-root {
    --pp-accent: ${t.accent};
    --pp-ink: ${t.ink};
    --pp-cover-bg: ${t.coverBg};
    --pp-cover-ink: ${t.coverInk};
    --pp-cover-sub: ${t.coverSub};
    --pp-band-bg: ${t.bandBg};
    --pp-band-ink: ${t.bandInk};
}
${BASE_CSS}
${STUDIO_CSS}
`;
}

const BASE_CSS = `
.pp-root { font-family: 'Gilroy', system-ui, sans-serif; color: var(--pp-ink); background: #fff; }
.pp-hint { position: fixed; top: 16px; right: 16px; background: #000; color: #fff; padding: 12px 16px; border-radius: 8px; font-size: 13px; z-index: 9999; }
.pp-hint button { background: #fff; color: #000; border: none; padding: 8px 16px; margin-left: 12px; border-radius: 4px; cursor: pointer; font-weight: 600; }

/* page frame */
.pp-cover, .pp-page { margin: 0 auto; display: flex; flex-direction: column; padding: 0; box-sizing: border-box; }
.pp-page { background: #fff; }
.pp-cover { background: var(--pp-cover-bg); }
.pp-root[data-orient="portrait"] .pp-cover, .pp-root[data-orient="portrait"] .pp-page { width: 186mm; min-height: 273mm; }
.pp-root[data-orient="landscape"] .pp-cover, .pp-root[data-orient="landscape"] .pp-page { width: 273mm; min-height: 186mm; }
@media screen {
    .pp-root { background: #f3f4f6; padding: 8px 0 40px; }
    .pp-cover, .pp-page { box-shadow: 0 1px 8px rgba(0,0,0,0.12); margin: 16px auto; padding: 14mm; }
}

/* cover */
.pp-cover { justify-content: space-between; }
.pp-cover-logo { height: 26px; width: auto; }
.pp-root[data-cover="dark"] .pp-cover-logo { filter: brightness(0) invert(1); }
.pp-cover-mid { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.pp-cover-word { font-size: 52px; font-weight: 900; letter-spacing: -0.01em; line-height: 1.02; text-transform: uppercase; color: var(--pp-cover-ink); word-break: break-word; }
.pp-cover-sub { margin-top: 14px; font-size: 18px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pp-cover-sub); }
.pp-cover-project { margin-top: 10px; font-size: 15px; color: var(--pp-cover-ink); opacity: 0.6; }
.pp-cover-band { background: var(--pp-band-bg); color: var(--pp-band-ink); padding: 14px 18px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; line-height: 1.5; }
.pp-cover-band-strong { font-weight: 700; font-size: 13px; }
.pp-cover-band-right { text-align: right; }
.pp-cover-clientlogo { max-height: 150px; max-width: 78%; width: auto; object-fit: contain; margin-bottom: 20px; }

/* page head */
.pp-page-head { border-bottom: 2px solid var(--pp-accent); padding-bottom: 8px; margin-bottom: 12px; }
.pp-ref { display: inline-block; background: var(--pp-accent); color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 2px; }
.pp-title { font-size: 22px; font-weight: 800; margin: 6px 0 0; }

/* body */
.pp-body { flex: 1; display: flex; flex-direction: column; gap: 12px; }
.pp-pagebreak { break-before: page; page-break-before: always; height: 0; }
.pp-page-flow { display: block; }
.pp-page-flow .pp-body { display: block; }
.pp-page-flow .pp-body > * { margin-bottom: 12px; }
.pp-page-flow .pp-titleblock { margin-top: 16px; }
/* Linked blocks kept on one page (break-inside:avoid honoured in block flow). */
.pp-keep { display: flex; flex-direction: column; gap: 12px; break-inside: avoid; page-break-inside: avoid; }
.pp-h { font-size: 15px; font-weight: 800; margin: 4px 0 0; }
.pp-block-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--pp-accent); margin-bottom: 5px; }
.pp-text-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pp-accent); margin-bottom: 4px; }
.pp-text-body { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; margin: 0; color: #2a2a2a; }

.pp-fig { margin: 0; }
.pp-fig img { display: block; border: 1px solid #e5e5e5; border-radius: 3px; background: #fafafa; }
.pp-cap { font-size: 11px; color: #777; margin-top: 4px; font-style: italic; }

.pp-spec-table { width: 100%; border-collapse: collapse; }
.pp-spec-table th { text-align: left; width: 38%; font-size: 11px; font-weight: 600; color: #555; padding: 6px 10px; background: #f4f7f8; border: 1px solid #e5e5e5; vertical-align: top; }
.pp-spec-table td { font-size: 12px; padding: 6px 10px; border: 1px solid #e5e5e5; vertical-align: top; }

.pp-callouts ul { margin: 0; padding-left: 0; list-style: none; }
.pp-callouts li { font-size: 12px; line-height: 1.5; padding-left: 16px; position: relative; margin-bottom: 3px; }
.pp-callouts li::before { content: ''; position: absolute; left: 2px; top: 7px; width: 6px; height: 6px; background: var(--pp-accent); border-radius: 1px; }

.pp-stages-table { width: 100%; border-collapse: collapse; }
.pp-stages-table th { text-align: left; font-size: 12px; font-weight: 700; padding: 5px 8px; white-space: nowrap; border-bottom: 1px solid #eee; vertical-align: top; width: 1%; }
.pp-stages-table td { font-size: 12px; padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
.pp-stage-instr { color: #555; }
.pp-tick-cell { width: 1%; }
.pp-tick { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border: 1.5px solid var(--pp-accent); border-radius: 2px; font-size: 11px; line-height: 1; color: #fff; }
.pp-tick.done { background: var(--pp-accent); }

.pp-qc-row { display: flex; gap: 22px; flex-wrap: wrap; }
.pp-qc-item { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; }

/* title block — band (default) */
.pp-titleblock { margin-top: 12px; background: var(--pp-band-bg); color: var(--pp-band-ink); display: flex; align-items: center; gap: 14px; padding: 9px 14px; }
.pp-tb-brand { border-right: 1px solid rgba(255,255,255,0.35); padding-right: 14px; }
.pp-tb-tag { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.85; }
.pp-tb-fields { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; }
.pp-root[data-orient="landscape"] .pp-tb-fields { grid-template-columns: repeat(6, 1fr); }
.pp-tb-field { display: flex; flex-direction: column; line-height: 1.2; }
.pp-tb-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.8; }
.pp-tb-value { font-size: 11px; font-weight: 600; }
.pp-tb-page { font-size: 11px; font-weight: 700; opacity: 0.9; }
.pp-tb-logo { height: 16px; width: auto; display: block; margin-bottom: 3px; filter: brightness(0) invert(1); }

/* title block — ruled (editorial) */
.pp-root[data-tb="rule"] .pp-titleblock { background: transparent; color: var(--pp-ink); border-top: 2px solid var(--pp-accent); padding: 10px 0 0; }
.pp-root[data-tb="rule"] .pp-tb-brand { border-right-color: rgba(0,0,0,0.15); }
.pp-root[data-tb="rule"] .pp-tb-logo { filter: none; }
.pp-root[data-tb="rule"] .pp-tb-label { opacity: 0.55; }
.pp-root[data-tb="rule"] .pp-tb-tag { opacity: 0.6; }

/* technical drawing + overall dimensions */
.pp-tech { margin: 0; }
.pp-tech-grid { display: grid; grid-template-columns: 24px 1fr; grid-template-rows: auto 24px; }
.pp-tech-frame { border: 1px solid #d3d7d9; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pp-tech-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pp-dim { position: relative; }
.pp-dim-h { height: 24px; }
.pp-dim-line-h { position: absolute; top: 11px; left: 2px; right: 2px; height: 1px; background: var(--pp-accent); }
.pp-dim-tick-h { position: absolute; top: 6px; width: 1px; height: 11px; background: var(--pp-accent); }
.pp-dim-v { width: 24px; }
.pp-dim-line-v { position: absolute; left: 11px; top: 2px; bottom: 2px; width: 1px; background: var(--pp-accent); }
.pp-dim-tick-v { position: absolute; left: 6px; height: 1px; width: 11px; background: var(--pp-accent); }
.pp-dim-chip { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 5px; font-size: 9px; font-weight: 700; color: var(--pp-accent); white-space: nowrap; }
.pp-dim-chip-v { top: 50%; left: 11px; transform: translate(-50%, -50%) rotate(-90deg); }
`;

// Studio = a designed landscape sheet: refined cover + a left spec/metadata
// rail and a large right "stage" for the drawings. Scoped under .pp-studio*.
const STUDIO_CSS = `
.pp-studio-cover-inner { flex: 1; display: flex; flex-direction: column; justify-content: space-between; border-left: 3px solid var(--pp-accent); padding-left: 18mm; }
.pp-studio-cover-top { display: flex; align-items: center; justify-content: space-between; }
.pp-studio-kicker { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.28em; color: var(--pp-accent); }
.pp-studio-eyebrow { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.32em; color: #6b7280; margin-bottom: 16px; }
.pp-studio-clientlogo { max-height: 90px; max-width: 56%; object-fit: contain; display: block; margin-bottom: 16px; }
.pp-studio-word { font-size: 60px; font-weight: 900; line-height: 0.95; letter-spacing: -0.02em; text-transform: uppercase; color: var(--pp-cover-ink); max-width: 92%; }
.pp-studio-project { margin-top: 14px; font-size: 16px; font-weight: 500; color: #4b5563; }
.pp-studio-cover-foot { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e5e7eb; padding-top: 11px; font-size: 11px; color: #6b7280; }
.pp-studio-foot-l { display: flex; flex-direction: column; gap: 2px; }
.pp-studio-foot-strong { font-weight: 700; color: #1f2937; font-size: 12px; }
.pp-studio-foot-r { display: flex; gap: 16px; }

.pp-studio-head { display: flex; align-items: baseline; gap: 14px; border-bottom: 2px solid var(--pp-accent); padding-bottom: 9px; margin-bottom: 9mm; }
.pp-studio-num { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #fff; background: var(--pp-accent); padding: 4px 9px; border-radius: 2px; white-space: nowrap; }
.pp-studio-title { font-size: 26px; font-weight: 800; letter-spacing: -0.01em; margin: 0; flex: 1; }
.pp-studio-headmeta { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: #9ca3af; white-space: nowrap; }
.pp-studio-grid { flex: 1; display: grid; grid-template-columns: 82mm 1fr; gap: 11mm; min-height: 0; }
.pp-studio-rail { display: flex; flex-direction: column; gap: 7mm; border-right: 1px solid #e5e7eb; padding-right: 10mm; }
.pp-studio-stage { display: flex; flex-direction: column; gap: 7mm; min-width: 0; }
.pp-studio-empty { flex: 1; display: flex; align-items: center; justify-content: center; border: 1px dashed #d1d5db; border-radius: 4px; color: #9ca3af; font-size: 12px; }

/* refined block presentation inside the rail (hairline lists, not boxes) */
.pp-studio-rail .pp-spec-table th { background: transparent; border: none; border-bottom: 1px solid #eceef0; padding: 5px 0; color: #6b7280; width: 44%; }
.pp-studio-rail .pp-spec-table td { border: none; border-bottom: 1px solid #eceef0; padding: 5px 0 5px 8px; }
.pp-studio-rail .pp-stages-table th, .pp-studio-rail .pp-stages-table td { font-size: 11px; }
.pp-studio-stage .pp-fig img { border-radius: 4px; }

/* studio title block pinned to the foot of the rail */
.pp-studio-tb { margin-top: auto; border-top: 1px solid #e5e7eb; padding-top: 10px; }
.pp-studio-tb-logo { height: 15px; width: auto; display: block; margin-bottom: 9px; }
.pp-studio-tb-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 10px; }
.pp-studio-tb-field { display: flex; flex-direction: column; line-height: 1.2; }
.pp-studio-tb-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; }
.pp-studio-tb-value { font-size: 11px; font-weight: 600; color: #1f2937; }
`;
