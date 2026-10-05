'use client';

import Link from 'next/link';
import { ExternalLink, FileText, Trash2 } from 'lucide-react';
import { formatPence, signSpec, type JobResult, type TraceGroup } from '@/lib/quoter/engine/panel-letters-v2';
import type { CalculatorJobSummary, PriceBook, PriceBookVersion } from '@/lib/quoter/calculator/types';

const GROUP_ORDER: TraceGroup[] = ['Panel', 'Aperture', 'Letters', 'Illumination', 'Labour', 'Total'];

const stamp = (v: PriceBookVersion) =>
    v.version
        ? `price book v${v.version}, saved ${new Date(v.created_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${v.created_by_email ? ` by ${v.created_by_email}` : ''}`
        : 'the built-in price book (not yet saved)';

// ===========================================================================
// Breakdown — every figure traced back to the price book
// ===========================================================================

export function BreakdownView({ priced, book }: { priced: JobResult; book: PriceBook }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="calc-note info" style={{ maxWidth: 900 }}>
                Every figure below traces back to a row in the price book. The materials markup applies to the panel,
                its finish, the aperture and its LEDs, and the transformers. Letter and illumination prices already
                carry their markup, and labour is charged at the hourly sell rate. Amounts are for the whole quantity
                of each sign.
            </div>
            {priced.signs.map(({ sign, r }) => (
                <section key={sign.id} className="calc-panel">
                    <header>
                        <span>
                            {sign.name}
                            {sign.qty > 1 && ` · ${sign.qty} off`}
                        </span>
                        <span className="mono">{formatPence(r.total_pence)}</span>
                    </header>
                    <div className="body" style={{ gap: 4 }}>
                        <span className="hint" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                            {signSpec(sign, book).join(' · ') || 'Nothing specified yet'}
                        </span>
                        {(r.errors.length > 0 || r.warnings.length > 0) && (
                            <div className="calc-notes" style={{ marginTop: 8 }}>
                                {r.errors.map((e) => <div key={e} className="calc-note err">{e}</div>)}
                                {r.warnings.map((w) => <div key={w} className="calc-note warn">{w}</div>)}
                            </div>
                        )}
                        {GROUP_ORDER.filter((g) => r.trace.some((t) => t.group === g)).map((g) => (
                            <div key={g} className="calc-bd-group">
                                <h4>{g}</h4>
                                {r.trace
                                    .filter((t) => t.group === g)
                                    .map((t, i) => (
                                        <div key={i} className={`calc-bd-line${t.sub ? ' sub' : ''}${t.total ? ' total' : ''}`}>
                                            <span className="lab">{t.label}</span>
                                            <span className="work">{t.work}</span>
                                            <span className="val">{t.value === null ? '' : formatPence(t.value)}</span>
                                        </div>
                                    ))}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
            {priced.extras.length > 0 && (
                <section className="calc-panel">
                    <header>
                        Job extras <span className="mono">{formatPence(priced.extras_pence)}</span>
                    </header>
                    <div className="body" style={{ gap: 0 }}>
                        {priced.extras.map((e) => (
                            <div key={e.id} className="calc-bd-line">
                                <span className="lab">{e.description || 'Untitled line'}</span>
                                <span className="work">
                                    {e.qty} × {formatPence(e.unit_cost_pence)}
                                    {e.markup ? ` + ${book.settings.markup_pct}% = ${formatPence(e.sell_unit_pence)} each` : ' at sell price'}
                                </span>
                                <span className="val">{formatPence(e.line_pence)}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            <section className="calc-panel">
                <div className="body" style={{ gap: 0 }}>
                    <div className="calc-bd-line"><span className="lab">Signs</span><span className="work" /><span className="val">{formatPence(priced.signs_pence)}</span></div>
                    <div className="calc-bd-line"><span className="lab">Extras</span><span className="work" /><span className="val">{formatPence(priced.extras_pence)}</span></div>
                    <div className="calc-bd-line"><span className="lab">Net</span><span className="work">ex VAT</span><span className="val">{formatPence(priced.net_pence)}</span></div>
                    <div className="calc-bd-line"><span className="lab">VAT</span><span className="work">at {book.settings.vat_pct}%</span><span className="val">{formatPence(priced.vat_pence)}</span></div>
                    <div className="calc-bd-line total"><span className="lab">Total</span><span className="work">inc VAT</span><span className="val">{formatPence(priced.gross_pence)}</span></div>
                </div>
            </section>
        </div>
    );
}

// ===========================================================================
// Quote — what the customer will see, and the door into a real quote
// ===========================================================================

export function QuoteView({
    priced,
    book,
    title,
    clientName,
    reference,
    quoteId,
    busy,
    onCreate,
}: {
    priced: JobResult;
    book: PriceBookVersion;
    title: string;
    clientName: string;
    reference: string | null;
    quoteId: string | null;
    busy: boolean;
    onCreate: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="calc-panel" style={{ maxWidth: 900 }}>
                <div className="body" style={{ gap: 12 }}>
                    {quoteId ? (
                        <div className="calc-actions">
                            <span style={{ fontSize: 14 }}>This job has been turned into a quote.</span>
                            <Link href={`/admin/quotes/${quoteId}`} className="btn-primary" style={{ fontSize: 13 }}>
                                <ExternalLink size={14} /> Open the quote
                            </Link>
                        </div>
                    ) : (
                        <>
                            <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-muted)' }}>
                                Creating a quote saves this job and makes a draft Odysseus quote with its own OSD
                                reference and 30-day validity. Each sign becomes a quote line at the price below, with
                                its tray, aperture and letters carried as sub-items for the artwork skeleton. Extras
                                become service lines.
                            </p>
                            <div className="calc-actions">
                                <button
                                    className="btn-primary"
                                    onClick={onCreate}
                                    disabled={busy || priced.error_count > 0 || priced.net_pence <= 0}
                                >
                                    <FileText size={14} /> {busy ? 'Creating…' : 'Create quote'}
                                </button>
                                {priced.error_count > 0 && (
                                    <span className="calc-note err">Part of this job is not priced — fix the red notes on the Calculator tab first.</span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>

            <section className="calc-panel calc-quote">
                <div className="body" style={{ gap: 16 }}>
                    <div className="head">
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>{title || 'Untitled job'}</div>
                            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{clientName || 'No client yet'}</div>
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', textAlign: 'right' }}>
                            {reference ?? 'not saved yet'}
                            <br />
                            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                    <div className="calc-tablewrap">
                        <table className="calc-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Specification</th>
                                    <th className="num">Qty</th>
                                    <th className="num">Each</th>
                                    <th className="num">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {priced.signs.map(({ sign, r }) => (
                                    <tr key={sign.id}>
                                        <td>{sign.name}</td>
                                        <td style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{signSpec(sign, book.book).join('; ')}</td>
                                        <td className="num">{r.qty}</td>
                                        <td className="num">{formatPence(r.unit_pence)}</td>
                                        <td className="num">{formatPence(r.total_pence)}</td>
                                    </tr>
                                ))}
                                {priced.extras.map((e) => (
                                    <tr key={e.id}>
                                        <td>{e.description || 'Additional item'}</td>
                                        <td />
                                        <td className="num">{e.qty}</td>
                                        {/* The SELL price, so each × qty is the line the customer reads. */}
                                        <td className="num">{formatPence(e.sell_unit_pence)}</td>
                                        <td className="num">{formatPence(e.line_pence)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="totals">
                        <div><span>Net</span><span>{formatPence(priced.net_pence)}</span></div>
                        <div><span>VAT at {book.book.settings.vat_pct}%</span><span>{formatPence(priced.vat_pence)}</span></div>
                        <div className="grand"><span>Total</span><span>{formatPence(priced.gross_pence)}</span></div>
                    </div>
                    <span className="hint" style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                        Priced from {stamp(book)}.
                    </span>
                </div>
            </section>
        </div>
    );
}

// ===========================================================================
// Saved jobs
// ===========================================================================

export function JobsView({
    jobs,
    currentId,
    onOpen,
    onDelete,
    busy,
}: {
    jobs: CalculatorJobSummary[];
    currentId: string | null;
    onOpen: (id: string) => void;
    onDelete: (id: string, label: string) => void;
    busy: boolean;
}) {
    if (!jobs.length) {
        return (
            <section className="calc-panel">
                <div className="calc-empty">No saved jobs yet. Price a job on the Calculator tab and press Save.</div>
            </section>
        );
    }
    return (
        <section className="calc-panel">
            <div className="calc-tablewrap">
                <table className="calc-table">
                    <thead>
                        <tr>
                            <th>Ref</th>
                            <th>Job</th>
                            <th>Client</th>
                            <th className="num">Net</th>
                            <th>Quote</th>
                            <th>Updated</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((j) => (
                            <tr key={j.id} style={j.id === currentId ? { background: 'var(--surface-2)' } : undefined}>
                                <td className="mono">{j.reference}</td>
                                <td>
                                    <button className="calc-linkbtn" disabled={busy} onClick={() => onOpen(j.id)}>
                                        {j.title}
                                    </button>
                                </td>
                                <td>{j.client_name ?? '—'}</td>
                                <td className="num mono">{formatPence(j.net_pence)}</td>
                                <td>
                                    {j.quote_id ? (
                                        <Link className="calc-linkbtn" href={`/admin/quotes/${j.quote_id}`}>
                                            {j.quote_number ?? 'quote'}
                                        </Link>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td style={{ color: 'var(--fg-muted)' }}>
                                    {new Date(j.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </td>
                                <td>
                                    <button className="calc-iconbtn" aria-label={`Delete ${j.reference}`} onClick={() => onDelete(j.id, j.reference)}>
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
