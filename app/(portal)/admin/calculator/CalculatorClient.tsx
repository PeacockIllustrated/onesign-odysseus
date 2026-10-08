'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, FilePlus2, Plus, Save, Trash2, X } from 'lucide-react';
import {
    blankJob,
    blankLetterSet,
    blankSign,
    formatPence,
    newId,
    normaliseSign,
    panelMaterials,
    apertureMaterials,
    priceJob,
    type JobResult,
    type SignResult,
} from '@/lib/quoter/engine/panel-letters-v2';
import type {
    CalcJob,
    CalcSign,
    CalculatorJobRow,
    CalculatorJobSummary,
    PriceBook,
    PriceBookVersion,
} from '@/lib/quoter/calculator/types';
import {
    createQuoteFromCalculatorJob,
    deleteCalculatorJob,
    getCalculatorJob,
    listCalculatorJobs,
    saveCalculatorJob,
} from '@/lib/quoter/calculator/actions';
import { ConfirmButton, Field, MoneyInput, NumberInput } from './fields';
import { HoursField } from './HoursField';
import { BreakdownView, JobsView, QuoteView } from './views';
import { PriceBookEditor } from './PriceBookEditor';
import './calculator.css';

type Tab = 'calc' | 'breakdown' | 'quote' | 'jobs' | 'book';

interface Meta {
    id: string | null;
    reference: string | null;
    title: string;
    client_name: string;
    org_id: string | null;
    quote_id: string | null;
}

const blankMeta = (): Meta => ({ id: null, reference: null, title: '', client_name: '', org_id: null, quote_id: null });

function normaliseJob(job: CalcJob, book: PriceBook): { job: CalcJob; notes: string[] } {
    const notes: string[] = [];
    const signs = job.signs.map((s) => {
        const r = normaliseSign(s, book);
        notes.push(...r.notes);
        return r.sign;
    });
    return { job: { ...job, signs }, notes };
}

export function CalculatorClient({
    initialBook,
    initialJobs,
    initialJob,
    orgs,
    loadError,
}: {
    initialBook: PriceBookVersion;
    initialJobs: CalculatorJobSummary[];
    initialJob: CalculatorJobRow | null;
    orgs: { id: string; name: string }[];
    loadError: string | null;
}) {
    const [book, setBook] = useState(initialBook);
    const [jobs, setJobs] = useState(initialJobs);
    const [meta, setMeta] = useState<Meta>(() =>
        initialJob
            ? {
                  id: initialJob.id,
                  reference: initialJob.reference,
                  title: initialJob.title,
                  client_name: initialJob.client_name ?? '',
                  org_id: initialJob.org_id,
                  quote_id: initialJob.quote_id,
              }
            : blankMeta()
    );
    const [job, setJob] = useState<CalcJob>(() =>
        normaliseJob(initialJob ? initialJob.job : blankJob(initialBook.book), initialBook.book).job
    );
    const [sel, setSel] = useState(0);
    const [tab, setTab] = useState<Tab>('calc');
    const [dirty, setDirty] = useState(false);
    const [notes, setNotes] = useState<string[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ kind: 'err' | 'info'; text: string } | null>(
        loadError ? { kind: 'err', text: loadError } : null
    );

    const priced = useMemo(() => priceJob(job, book.book), [job, book]);
    const signIdx = Math.min(sel, job.signs.length - 1);
    const sign = job.signs[signIdx];
    const result = priced.signs[signIdx]?.r;

    // Leaving with unsaved work asks first.
    useEffect(() => {
        if (!dirty) return;
        const h = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [dirty]);

    // Every edit runs the job back through normaliseSign, so a dropdown can
    // never show one thing while the sign holds another (audit finding 1).
    // Whatever it had to re-point is said out loud until the next edit.
    const edit = useCallback(
        (fn: (j: CalcJob) => CalcJob) => {
            const next = normaliseJob(fn(structuredClone(job)), book.book);
            setJob(next.job);
            setNotes(next.notes);
            setDirty(true);
        },
        [job, book]
    );

    const editSign = (fn: (s: CalcSign) => void) =>
        edit((j) => {
            fn(j.signs[signIdx]);
            return j;
        });

    const setMetaField = <K extends keyof Meta>(k: K, v: Meta[K]) => {
        setMeta((m) => ({ ...m, [k]: v }));
        setDirty(true);
    };

    // --- jobs -------------------------------------------------------------

    const refreshJobs = async () => {
        const r = await listCalculatorJobs();
        if (r.ok) setJobs(r.data);
    };

    const save = async (): Promise<string | null> => {
        setBusy('save');
        setMessage(null);
        const r = await saveCalculatorJob({
            id: meta.id,
            title: meta.title,
            client_name: meta.client_name,
            org_id: meta.org_id,
            job,
        });
        setBusy(null);
        if (!r.ok) {
            setMessage({ kind: 'err', text: r.error });
            return null;
        }
        setMeta((m) => ({ ...m, id: r.data.id, reference: r.data.reference, title: r.data.title }));
        setDirty(false);
        void refreshJobs();
        return r.data.id;
    };

    // Questions are asked on the page, never with window.confirm: a browser
    // that has been told to "prevent this page from creating additional
    // dialogs" answers every confirm() with false, and the button it guarded
    // silently stops working — which is how "remove" looked broken.
    const [pending, setPending] = useState<{ text: string; yes: string; run: () => void } | null>(null);
    const unlessDirty = (run: () => void) => {
        if (!dirty) return run();
        setPending({ text: 'This job has unsaved changes.', yes: 'Discard them and continue', run });
    };

    const newJob = () => unlessDirty(startNewJob);
    const startNewJob = () => {
        setMeta(blankMeta());
        setJob(blankJob(book.book));
        setSel(0);
        setDirty(false);
        setNotes([]);
        setTab('calc');
    };

    const openJob = (id: string) => unlessDirty(() => void loadJob(id));
    const loadJob = async (id: string) => {
        setBusy('open');
        const r = await getCalculatorJob(id);
        setBusy(null);
        if (!r.ok) {
            setMessage({ kind: 'err', text: r.error });
            return;
        }
        const n = normaliseJob(r.data.job, book.book);
        setMeta({
            id: r.data.id,
            reference: r.data.reference,
            title: r.data.title,
            client_name: r.data.client_name ?? '',
            org_id: r.data.org_id,
            quote_id: r.data.quote_id,
        });
        setJob(n.job);
        setNotes(n.notes);
        setSel(0);
        setDirty(false);
        setTab('calc');
        if (r.data.price_book_version !== book.version) {
            setMessage({
                kind: 'info',
                text: `${r.data.reference} was last saved against price book ${r.data.price_book_version ? `v${r.data.price_book_version}` : 'defaults'}. It is shown at today's prices (v${book.version}).`,
            });
        }
    };

    const removeJob = async (id: string) => {
        const r = await deleteCalculatorJob(id);
        if (!r.ok) {
            setMessage({ kind: 'err', text: r.error });
            return;
        }
        if (meta.id === id) {
            setMeta(blankMeta());
            setDirty(true);
        }
        void refreshJobs();
    };

    const makeQuote = async (again = false) => {
        if (priced.error_count > 0) {
            setMessage({ kind: 'err', text: 'Part of this job is not priced — fix the red notes first.' });
            return;
        }
        const id = dirty || !meta.id ? await save() : meta.id;
        if (!id) return;
        setBusy('quote');
        // The net on screen goes with the request: if the book changed in the
        // meantime, the server refuses rather than quoting a figure nobody saw.
        const r = await createQuoteFromCalculatorJob(id, { expectedNetPence: priced.net_pence, again });
        setBusy(null);
        if (!r.ok) {
            setMessage({ kind: 'err', text: r.error });
            return;
        }
        setMeta((m) => ({ ...m, quote_id: r.data.quote_id }));
        setMessage({
            kind: 'info',
            text: `${again ? 'Revised quote' : 'Quote'} created. It is a normal draft quote now — edit, send and accept it from Quotes.`,
        });
        void refreshJobs();
    };

    /** Remove a sign. The last one is replaced by a blank, so there is always one to edit. */
    const removeSign = (i: number) => {
        edit((j) => {
            j.signs.splice(i, 1);
            if (!j.signs.length) j.signs.push(blankSign(book.book, 1));
            return j;
        });
        setSel((cur) => Math.max(0, cur >= i ? cur - 1 : cur));
    };

    const noExtras = priced.extras.every((e) => e.line_pence <= 0);
    const unconfirmed = !book.book.settings.figures_confirmed_by;

    // --- render ------------------------------------------------------------

    return (
        <div className="calc-app">
            <div className="calc-bar">
                <Field label="Job">
                    <input
                        className="calc-input"
                        style={{ width: 240 }}
                        value={meta.title}
                        placeholder="e.g. Greggs, Gateshead fascia"
                        onChange={(e) => setMetaField('title', e.target.value)}
                    />
                </Field>
                <Field label="Client name">
                    <input
                        className="calc-input"
                        style={{ width: 200 }}
                        value={meta.client_name}
                        onChange={(e) => setMetaField('client_name', e.target.value)}
                    />
                </Field>
                <Field label="Client record (carries onto the quote)">
                    <select
                        className="calc-input"
                        style={{ width: 220 }}
                        value={meta.org_id ?? ''}
                        onChange={(e) => {
                            const id = e.target.value || null;
                            setMetaField('org_id', id);
                            const org = orgs.find((o) => o.id === id);
                            if (org && !meta.client_name) setMetaField('client_name', org.name);
                        }}
                    >
                        <option value="">— none —</option>
                        {orgs.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.name}
                            </option>
                        ))}
                    </select>
                </Field>
                <span className="ref mono">{meta.reference ?? 'not saved yet'}</span>
                <span className="grow" />
                <span className={`state ${dirty ? 'dirty' : ''}`}>{dirty ? 'unsaved changes' : meta.id ? 'saved' : ''}</span>
                <button className="btn-secondary" onClick={newJob} disabled={!!busy}>
                    <FilePlus2 size={14} /> New job
                </button>
                <button className="btn-primary" onClick={save} disabled={!!busy || (!dirty && !!meta.id)}>
                    <Save size={14} /> {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
            </div>

            {message && (
                <div className={`calc-note ${message.kind === 'err' ? 'err' : 'info'}`} role="status" style={{ display: 'flex', gap: 10 }}>
                    <span style={{ flex: 1 }}>
                        {message.text}{' '}
                        {meta.quote_id && message.kind === 'info' && (
                            <Link href={`/admin/quotes/${meta.quote_id}`} className="calc-linkbtn">
                                Open the quote <ExternalLink size={12} style={{ display: 'inline' }} />
                            </Link>
                        )}
                    </span>
                    <button className="calc-iconbtn" aria-label="Dismiss" onClick={() => setMessage(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {pending && (
                <div className="calc-note warn" role="alertdialog" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1 }}>{pending.text}</span>
                    <button
                        className="btn-danger"
                        style={{ fontSize: 13 }}
                        onClick={() => {
                            const run = pending.run;
                            setPending(null);
                            run();
                        }}
                    >
                        {pending.yes}
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setPending(null)}>
                        Keep editing
                    </button>
                </div>
            )}

            {unconfirmed && (
                <div className="calc-note warn">
                    <b>These prices have not been signed off yet.</b> The price book is Mak&rsquo;s spreadsheet as he
                    supplied it, including the figures he flagged himself — fabrication and assembly at £65/hr where the
                    old system charged £90, and the 3000 × 1500 sheet at £87. Check them on the Price book tab and mark
                    them confirmed before quoting real work from it.
                </div>
            )}

            {meta.quote_id && (
                <div className="calc-note info">
                    This job has been turned into a quote. Edits here do not change it — use{' '}
                    <b>Create a revised quote</b> on the Quote tab once you are happy, or{' '}
                    <Link href={`/admin/quotes/${meta.quote_id}`} className="calc-linkbtn">
                        open the quote
                    </Link>{' '}
                    to change it there.
                </div>
            )}

            <nav className="calc-tabs" role="tablist">
                {(
                    [
                        ['calc', 'Calculator'],
                        ['breakdown', 'Breakdown'],
                        ['quote', 'Quote'],
                        ['jobs', `Saved jobs (${jobs.length})`],
                        ['book', `Price book v${book.version}`],
                    ] as [Tab, string][]
                ).map(([k, label]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                        {label}
                    </button>
                ))}
            </nav>

            {tab === 'calc' && sign && result && (
                <div className="calc-layout">
                    <SignList
                        job={job}
                        priced={priced}
                        sel={signIdx}
                        onSelect={setSel}
                        onRemove={removeSign}
                        onAdd={() => {
                            edit((j) => ({ ...j, signs: [...j.signs, blankSign(book.book, j.signs.length + 1)] }));
                            setSel(job.signs.length);
                        }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                        <SignEditor
                            sign={sign}
                            r={result}
                            book={book.book}
                            notes={notes}
                            editSign={editSign}
                            onDuplicate={() => {
                                edit((j) => {
                                    const c = structuredClone(j.signs[signIdx]);
                                    c.id = newId();
                                    c.name = `${c.name} (copy)`;
                                    j.signs.splice(signIdx + 1, 0, c);
                                    return j;
                                });
                                setSel(signIdx + 1);
                            }}
                            onRemove={() => removeSign(signIdx)}
                        />
                        <ExtrasEditor job={job} priced={priced} book={book.book} edit={edit} />
                    </div>
                    <div className="calc-right">
                        <SignMoney sign={sign} r={result} />
                        <JobMoney
                            priced={priced}
                            book={book.book}
                            noExtras={noExtras}
                            onQuote={() => setTab('quote')}
                            onBreakdown={() => setTab('breakdown')}
                        />
                    </div>
                </div>
            )}

            {tab === 'breakdown' && <BreakdownView priced={priced} book={book.book} />}

            {tab === 'quote' && (
                <QuoteView
                    priced={priced}
                    book={book}
                    title={meta.title}
                    clientName={meta.client_name}
                    reference={meta.reference}
                    quoteId={meta.quote_id}
                    busy={busy === 'quote' || busy === 'save'}
                    noExtras={noExtras}
                    onCreate={makeQuote}
                />
            )}

            {tab === 'jobs' && (
                <JobsView jobs={jobs} currentId={meta.id} onOpen={openJob} onDelete={removeJob} busy={busy === 'open'} />
            )}

            {tab === 'book' && (
                <PriceBookEditor
                    key={book.version}
                    current={book}
                    onSaved={(v) => {
                        setBook(v);
                        const n = normaliseJob(job, v.book);
                        setJob(n.job);
                        setNotes(n.notes);
                    }}
                />
            )}
        </div>
    );
}

// ===========================================================================
// Calculator tab pieces
// ===========================================================================

function SignList({
    job,
    priced,
    sel,
    onSelect,
    onAdd,
    onRemove,
}: {
    job: CalcJob;
    priced: JobResult;
    sel: number;
    onSelect: (i: number) => void;
    onAdd: () => void;
    onRemove: (i: number) => void;
}) {
    return (
        <section className="calc-panel">
            <header>
                Signs
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onAdd}>
                    <Plus size={13} /> Add
                </button>
            </header>
            <div className="calc-signs">
                {job.signs.map((s, i) => {
                    const r = priced.signs[i].r;
                    return (
                        <div key={s.id} className="row" data-current={i === sel}>
                            <button className="pick" aria-current={i === sel} onClick={() => onSelect(i)}>
                                <span className="nm">
                                    {r.errors.length > 0 && <span className="calc-dot" title="Part of this sign is not priced" />}
                                    {s.name || 'Untitled sign'}
                                    {s.qty > 1 && <span className="badge">{s.qty} off</span>}
                                </span>
                                <span className="amt mono">{formatPence(r.total_pence)}</span>
                            </button>
                            <span className="rm">
                                <ConfirmButton
                                    className="calc-iconbtn"
                                    ariaLabel={`Remove ${s.name || 'sign'}`}
                                    question={job.signs.length > 1 ? 'Remove?' : 'Clear it?'}
                                    yes="Yes"
                                    onConfirm={() => onRemove(i)}
                                >
                                    <Trash2 size={14} />
                                </ConfirmButton>
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function SignEditor({
    sign,
    r,
    book,
    notes,
    editSign,
    onDuplicate,
    onRemove,
}: {
    sign: CalcSign;
    r: SignResult;
    book: PriceBook;
    notes: string[];
    editSign: (fn: (s: CalcSign) => void) => void;
    onDuplicate: () => void;
    onRemove: () => void;
}) {
    const mats = panelMaterials(book);
    const apMats = apertureMaterials(book);
    const sheetsForMaterial = book.sheets.filter((s) => s.use === 'panel' && s.active && s.material === sign.panel.material);

    return (
        <section className="calc-panel">
            <header>
                <input
                    className="calc-input"
                    aria-label="Sign name"
                    style={{ border: 0, padding: 0, fontWeight: 600, fontSize: 15, background: 'none', flex: 1 }}
                    value={sign.name}
                    onChange={(e) => editSign((s) => void (s.name = e.target.value))}
                />
                <span className="calc-actions">
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onDuplicate}>
                        <Copy size={13} /> Duplicate
                    </button>
                    <ConfirmButton
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        question={`Remove ${sign.name || 'this sign'}?`}
                        onConfirm={onRemove}
                    >
                        <Trash2 size={13} /> Remove
                    </ConfirmButton>
                </span>
            </header>
            <div className="body">
                {(r.errors.length > 0 || notes.length > 0) && (
                    <div className="calc-notes">
                        {r.errors.map((e) => (
                            <div key={e} className="calc-note err">
                                {e}
                            </div>
                        ))}
                        {notes.map((n) => (
                            <div key={n} className="calc-note info">
                                {n}
                            </div>
                        ))}
                    </div>
                )}

                <div className="calc-sec">
                    <h3>Panel</h3>
                    <div className="calc-grid4">
                        <Field label="Material">
                            <select
                                className="calc-input"
                                value={sign.panel.material}
                                onChange={(e) => editSign((s) => void (s.panel.material = e.target.value))}
                            >
                                {mats.map((m) => (
                                    <option key={m}>{m}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Face width (mm)">
                            <NumberInput value={sign.panel.width_mm} onChange={(v) => editSign((s) => void (s.panel.width_mm = v ?? 0))} />
                        </Field>
                        <Field label="Face height (mm)">
                            <NumberInput value={sign.panel.height_mm} onChange={(v) => editSign((s) => void (s.panel.height_mm = v ?? 0))} />
                        </Field>
                        <Field label="Return depth (mm, positive)">
                            <NumberInput value={sign.panel.returns_mm} onChange={(v) => editSign((s) => void (s.panel.returns_mm = v ?? 0))} />
                        </Field>
                    </div>
                    <div className="calc-grid4">
                        <Field label="Finish">
                            <select
                                className="calc-input"
                                value={sign.panel.finish_id}
                                onChange={(e) => editSign((s) => void (s.panel.finish_id = e.target.value))}
                            >
                                {book.panel_finishes.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Sheet size">
                            <select
                                className="calc-input"
                                value={sign.panel.sheet_id ?? ''}
                                onChange={(e) => editSign((s) => void (s.panel.sheet_id = e.target.value || null))}
                            >
                                <option value="">Best plan (auto)</option>
                                {sheetsForMaterial.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.w} × {s.h}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Quantity of this sign">
                            <NumberInput integer value={sign.qty} onChange={(v) => editSign((s) => void (s.qty = Math.max(1, v ?? 1)))} />
                        </Field>
                        <Field label={`Materials markup % (book: ${book.settings.markup_pct})`}>
                            <NumberInput
                                allowEmpty
                                placeholder={`${book.settings.markup_pct}`}
                                value={sign.materials_markup_pct}
                                onChange={(v) => editSign((s) => void (s.materials_markup_pct = v))}
                            />
                        </Field>
                    </div>
                    <div className="calc-derived">
                        <div>
                            <b>
                                {Math.round(r.dev_w_mm)} × {Math.round(r.dev_h_mm)}
                            </b>
                            <span>flat development, mm</span>
                        </div>
                        <div>
                            <b>{r.dev_area_m2.toFixed(3)}</b>
                            <span>material area each, m²</span>
                        </div>
                        <div>
                            <b>{r.sheet_label}</b>
                            <span>
                                sheet ·{' '}
                                {r.sheet_fixed
                                    ? 'fixed by you'
                                    : book.settings.cutting_priority === 'joins'
                                      ? 'fewest joins, then cost'
                                      : 'lowest cost'}
                            </span>
                        </div>
                        <div>
                            <b>
                                {r.sheets} @ {formatPence(r.sheet_price_pence)}
                            </b>
                            <span>
                                sheet{r.sheets === 1 ? '' : 's'}
                                {sign.qty > 1 ? ` for all ${sign.qty}` : ''}
                            </span>
                        </div>
                        <div>
                            <b>{r.panel_joins + r.aperture_joins}</b>
                            <span>
                                joins each{r.joint_hours ? ` · +${r.joint_hours.toFixed(2)} fab hrs` : ''}
                            </span>
                        </div>
                        <div>
                            <b>{formatPence(r.panel_pence + r.finish_pence)}</b>
                            <span>panel and finish</span>
                        </div>
                    </div>
                </div>

                <div className="calc-sec">
                    <h3>
                        Illuminated aperture
                        <label className="calc-check">
                            <input
                                type="checkbox"
                                checked={sign.aperture.on}
                                onChange={(e) => editSign((s) => void (s.aperture.on = e.target.checked))}
                            />
                            include
                        </label>
                    </h3>
                    {sign.aperture.on ? (
                        <div className="calc-grid3">
                            <Field label="Material">
                                <select
                                    className="calc-input"
                                    value={sign.aperture.material}
                                    onChange={(e) => editSign((s) => void (s.aperture.material = e.target.value))}
                                >
                                    {apMats.map((m) => (
                                        <option key={m}>{m}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Aperture width (mm)">
                                <NumberInput value={sign.aperture.width_mm} onChange={(v) => editSign((s) => void (s.aperture.width_mm = v ?? 0))} />
                            </Field>
                            <Field label="Aperture height (mm)">
                                <NumberInput value={sign.aperture.height_mm} onChange={(v) => editSign((s) => void (s.aperture.height_mm = v ?? 0))} />
                            </Field>
                        </div>
                    ) : (
                        <span className="hint">No aperture on this sign.</span>
                    )}
                </div>

                <div className="calc-sec">
                    <h3>
                        Letters
                        <span className="right">
                            <button
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                onClick={() => editSign((s) => void s.letter_sets.push(blankLetterSet(book)))}
                                disabled={sign.letter_sets.length >= 12}
                            >
                                <Plus size={13} /> Add set
                            </button>
                        </span>
                    </h3>
                    {sign.letter_sets.length === 0 && <span className="hint">No letters on this sign.</span>}
                    {sign.letter_sets.map((set, i) => {
                        const type = book.letter_types.find((t) => t.id === set.type_id);
                        return (
                            <div key={i} className="calc-letterrow">
                                <Field label="Type">
                                    <select
                                        className="calc-input"
                                        value={set.type_id}
                                        onChange={(e) => editSign((s) => void (s.letter_sets[i].type_id = e.target.value))}
                                    >
                                        {book.letter_types.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Letters per sign">
                                    <NumberInput integer value={set.qty} onChange={(v) => editSign((s) => void (s.letter_sets[i].qty = v ?? 0))} />
                                </Field>
                                <Field label="Height (mm)">
                                    <NumberInput step={10} value={set.height_mm} onChange={(v) => editSign((s) => void (s.letter_sets[i].height_mm = v ?? 0))} />
                                </Field>
                                <Field label="Finish">
                                    <select
                                        className="calc-input"
                                        value={set.finish_id}
                                        onChange={(e) => editSign((s) => void (s.letter_sets[i].finish_id = e.target.value))}
                                    >
                                        {(type?.finishes ?? []).map((f) => (
                                            <option key={f.id} value={f.id}>
                                                {f.name}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <div className="calc-actions" style={{ paddingBottom: 6 }}>
                                    <label className="calc-check">
                                        <input
                                            type="checkbox"
                                            checked={set.illuminated}
                                            onChange={(e) => editSign((s) => void (s.letter_sets[i].illuminated = e.target.checked))}
                                        />
                                        lit
                                    </label>
                                    <button
                                        className="calc-iconbtn"
                                        aria-label="Remove letter set"
                                        onClick={() => editSign((s) => void s.letter_sets.splice(i, 1))}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="calc-sec">
                    <h3>
                        Production hours
                        <span className="hint" style={{ fontWeight: 400 }}>
                            per sign{sign.qty > 1 ? ` — multiplied by ${sign.qty}` : ''}. Joins are added to fabrication automatically.
                        </span>
                    </h3>
                    <div className="calc-grid4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))` }}>
                        {book.labour.map((l) => (
                            <Field key={l.id} label={`${l.name} · ${formatPence(l.rate_pence)}/hr`}>
                                <HoursField
                                    label={l.name}
                                    value={sign.hours[l.id] ?? 0}
                                    onChange={(v) => editSign((s) => void (s.hours[l.id] = v))}
                                />
                            </Field>
                        ))}
                    </div>
                    <label className="calc-check">
                        <input
                            type="checkbox"
                            checked={sign.no_labour}
                            onChange={(e) => editSign((s) => void (s.no_labour = e.target.checked))}
                        />
                        No production labour on this sign (otherwise a sign with no hours cannot be quoted)
                    </label>
                </div>

                <div className="calc-sec">
                    <h3>Illumination hardware and discount</h3>
                    <div className="calc-grid4">
                        <Field label="Transformer">
                            <select
                                className="calc-input"
                                value={sign.transformer}
                                onChange={(e) => editSign((s) => void (s.transformer = e.target.value))}
                            >
                                <option value="auto">Cheapest (auto)</option>
                                {book.transformers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} — up to {t.max_leds} LEDs
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="LEDs per sign">
                            <input className="calc-input num" readOnly value={r.total_leds} />
                        </Field>
                        <Field label="Transformers per sign">
                            <input className="calc-input num" readOnly value={r.total_leds ? `${r.transformer_count} × ${r.transformer_name}` : '—'} />
                        </Field>
                        <Field label="Discount on this sign %">
                            <NumberInput max={100} value={sign.discount_pct} onChange={(v) => editSign((s) => void (s.discount_pct = v ?? 0))} />
                        </Field>
                    </div>
                </div>

                {r.warnings.length > 0 && (
                    <div className="calc-notes">
                        {r.warnings.map((w) => (
                            <div key={w} className="calc-note warn">
                                {w}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

/** What Mak's tool listed as priced by hand rather than calculated. */
const STANDARD_EXTRAS = ['Installation', 'Access equipment', 'Delivery', 'Survey', 'Artwork', 'Electrical connection'];

function ExtrasEditor({
    job,
    priced,
    book,
    edit,
}: {
    job: CalcJob;
    priced: JobResult;
    book: PriceBook;
    edit: (fn: (j: CalcJob) => CalcJob) => void;
}) {
    return (
        <section className="calc-panel">
            <header>
                Job extras
                <button
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() =>
                        edit((j) => ({
                            ...j,
                            extras: [...j.extras, { id: newId(), description: '', qty: 1, unit_cost_pence: 0, markup: false }],
                        }))
                    }
                >
                    <Plus size={13} /> Add line
                </button>
            </header>
            <div className="body" style={{ gap: 12 }}>
                <span className="hint" style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
                    Installation, access, delivery, survey, artwork and electrical connection are priced by hand. Tick
                    markup to run a line through the {book.settings.markup_pct}% materials markup; leave it clear for
                    anything already at sell price.
                </span>
                {/* Mak prices these by hand, so the calculator cannot — but it
                    can make sure nobody forgets them. One press adds the line;
                    the price still has to be typed. */}
                <div className="calc-chips" aria-label="Add a standard extra">
                    {STANDARD_EXTRAS.filter((d) => !job.extras.some((e) => e.description === d)).map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() =>
                                edit((j) => ({
                                    ...j,
                                    extras: [...j.extras, { id: newId(), description: d, qty: 1, unit_cost_pence: 0, markup: false }],
                                }))
                            }
                        >
                            + {d}
                        </button>
                    ))}
                </div>
                {job.extras.length > 0 && (
                    <div className="calc-tablewrap">
                        <table className="calc-table">
                            <thead>
                                <tr>
                                    <th>Description</th>
                                    <th className="num">Qty</th>
                                    <th className="num">Unit cost £</th>
                                    <th>Markup</th>
                                    <th className="num">Sell each</th>
                                    <th className="num">Line</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {job.extras.map((e, i) => (
                                    <tr key={e.id}>
                                        <td>
                                            <input
                                                className="calc-input"
                                                value={e.description}
                                                onChange={(ev) => edit((j) => ((j.extras[i].description = ev.target.value), j))}
                                            />
                                        </td>
                                        <td className="num">
                                            <NumberInput className="w-sm" step={0.5} value={e.qty} onChange={(v) => edit((j) => ((j.extras[i].qty = v ?? 0), j))} />
                                        </td>
                                        <td className="num">
                                            <MoneyInput className="w-num" pence={e.unit_cost_pence} onChange={(v) => edit((j) => ((j.extras[i].unit_cost_pence = v), j))} />
                                        </td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                aria-label="Apply markup"
                                                checked={e.markup}
                                                onChange={(ev) => edit((j) => ((j.extras[i].markup = ev.target.checked), j))}
                                            />
                                        </td>
                                        <td className="num mono">{formatPence(priced.extras[i].sell_unit_pence)}</td>
                                        <td className="num mono" style={priced.extras[i].line_pence ? undefined : { color: 'var(--calc-warn)' }}>
                                            {priced.extras[i].line_pence ? formatPence(priced.extras[i].line_pence) : 'no price'}
                                        </td>
                                        <td>
                                            <button
                                                className="calc-iconbtn"
                                                aria-label="Remove line"
                                                onClick={() => edit((j) => (j.extras.splice(i, 1), j))}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

function SignMoney({ sign, r }: { sign: CalcSign; r: SignResult }) {
    return (
        <section className="calc-panel">
            <header>This sign{sign.qty > 1 ? ` · ${sign.qty} off` : ''}</header>
            <div className="body" style={{ gap: 10 }}>
                <div className="calc-sum">
                    <div className="l"><span>Panel</span><b>{formatPence(r.panel_pence)}</b></div>
                    <div className="l"><span>Finish</span><b>{formatPence(r.finish_pence)}</b></div>
                    {sign.aperture.on && (
                        <div className="l"><span>Aperture + LEDs</span><b>{formatPence(r.aperture_pence + r.aperture_led_pence)}</b></div>
                    )}
                    <div className="l"><span>Transformers</span><b>{formatPence(r.transformer_pence)}</b></div>
                    <div className="rule" />
                    <div className="l"><span>Materials at cost</span><b>{formatPence(r.materials_pence)}</b></div>
                    <div className="l"><span>Materials markup {r.markup_pct}%</span><b>{formatPence(r.markup_pence)}</b></div>
                    <div className="rule" />
                    <div className="l"><span>Letters</span><b>{formatPence(r.letters_pence)}</b></div>
                    <div className="l"><span>Illumination</span><b>{formatPence(r.illumination_pence)}</b></div>
                    <div className="l"><span>Labour</span><b>{formatPence(r.labour_pence)}</b></div>
                    {r.discount_pence > 0 && (
                        <div className="l"><span>Discount</span><b>−{formatPence(r.discount_pence)}</b></div>
                    )}
                    <div className="rule" />
                    <div className="big">
                        {formatPence(r.total_pence)}
                        <small>{sign.qty > 1 ? `${sign.qty} at ${formatPence(r.unit_pence)} each, ex VAT` : 'sign total, ex VAT'}</small>
                    </div>
                </div>
            </div>
        </section>
    );
}

function JobMoney({
    priced,
    book,
    onQuote,
    onBreakdown,
    noExtras,
}: {
    priced: JobResult;
    book: PriceBook;
    onQuote: () => void;
    onBreakdown: () => void;
    noExtras: boolean;
}) {
    return (
        <section className="calc-panel">
            <header>Job total</header>
            <div className="body" style={{ gap: 12 }}>
                <div className="calc-sum">
                    <div className="l"><span>Signs</span><b>{formatPence(priced.signs_pence)}</b></div>
                    <div className="l"><span>Extras</span><b>{formatPence(priced.extras_pence)}</b></div>
                    <div className="rule" />
                    <div className="l"><span>Net</span><b>{formatPence(priced.net_pence)}</b></div>
                    <div className="l"><span>VAT {book.settings.vat_pct}%</span><b>{formatPence(priced.vat_pence)}</b></div>
                    <div className="big">
                        {formatPence(priced.gross_pence)}
                        <small>total inc VAT</small>
                    </div>
                </div>
                {priced.error_count > 0 && (
                    <div className="calc-note err">
                        {priced.error_count} thing{priced.error_count === 1 ? ' is' : 's are'} not priced — see the red notes.
                    </div>
                )}
                {noExtras && (
                    <div className="calc-note warn">
                        No installation, access or delivery on this job. They are priced by hand under Job extras —
                        add them if they apply.
                    </div>
                )}
                <div className="calc-actions">
                    <button className="btn-primary" onClick={onQuote}>Quote</button>
                    <button className="btn-secondary" onClick={onBreakdown}>See the working</button>
                </div>
            </div>
        </section>
    );
}
