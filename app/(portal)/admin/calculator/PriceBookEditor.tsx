'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { newId, validatePriceBook } from '@/lib/quoter/engine/panel-letters-v2';
import { defaultPriceBook } from '@/lib/quoter/calculator/default-price-book';
import { listPriceBookVersions, savePriceBook } from '@/lib/quoter/calculator/actions';
import type { PriceBook, PriceBookVersion } from '@/lib/quoter/calculator/types';
import { ConfirmButton, Field, MoneyInput, NumberInput } from './fields';

type Section = 'sheets' | 'finishes' | 'labour' | 'letters' | 'illum' | 'transformers' | 'settings' | 'history';

const SECTIONS: [Section, string][] = [
    ['sheets', 'Sheets'],
    ['finishes', 'Panel finishes'],
    ['labour', 'Labour rates'],
    ['letters', 'Letter prices'],
    ['illum', 'Illumination'],
    ['transformers', 'Transformers'],
    ['settings', 'Settings'],
    ['history', 'History'],
];

/**
 * The shared price book.
 *
 * Edits happen on a draft; nothing reaches anyone else until Save, which
 * writes a NEW version (the old ones stay as history). Save is refused while
 * the book has a problem that would stop pricing — no panel finish, no
 * transformer, a price row missing a height — which is what used to let one
 * deletion blank the original tool for good.
 *
 * Mounted with `key={version}`, so a newly saved version starts a fresh draft.
 */
export function PriceBookEditor({
    current,
    onSaved,
}: {
    current: PriceBookVersion;
    onSaved: (v: PriceBookVersion) => void;
}) {
    const [draft, setDraft] = useState<PriceBook>(() => structuredClone(current.book));
    const [section, setSection] = useState<Section>('sheets');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ kind: 'err' | 'info'; text: string } | null>(null);
    const [history, setHistory] = useState<
        { version: number; note: string | null; created_at: string; created_by_email: string | null }[] | null
    >(null);

    useEffect(() => {
        if (section !== 'history' || history) return;
        listPriceBookVersions().then((r) => setHistory(r.ok ? r.data : []));
    }, [section, history]);

    const problems = useMemo(() => validatePriceBook(draft), [draft]);
    const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(current.book), [draft, current]);

    const upd = (fn: (b: PriceBook) => void) =>
        setDraft((d) => {
            const c = structuredClone(d);
            fn(c);
            return c;
        });

    const save = async () => {
        setSaving(true);
        setMessage(null);
        const r = await savePriceBook({ book: draft, note, baseVersion: current.version });
        setSaving(false);
        if (!r.ok) {
            setMessage({ kind: 'err', text: r.error });
            return;
        }
        setNote('');
        setHistory(null);
        setMessage({ kind: 'info', text: `Saved as v${r.data.version}. Everyone pricing from now on uses it.` });
        onSaved(r.data);
    };

    const H = draft.heights;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <section className="calc-panel">
                <div className="body" style={{ gap: 12 }}>
                    <div className="calc-actions">
                        <span style={{ fontSize: 13.5 }}>
                            <b>v{current.version || 0}</b>
                            {current.version
                                ? ` · saved ${new Date(current.created_at!).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${current.created_by_email ? ` by ${current.created_by_email}` : ''}`
                                : ' · the built-in figures from Mak’s calculator, not saved yet'}
                        </span>
                        <span style={{ flex: 1 }} />
                        <input
                            className="calc-input"
                            style={{ width: 260 }}
                            placeholder="What changed? (shown in history)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                        <ConfirmButton
                            question="Replace the draft with Mak's original figures? Nothing is saved until you press Save."
                            yes="Replace the draft"
                            onConfirm={() => setDraft(defaultPriceBook())}
                        >
                            <RotateCcw size={14} /> Mak’s figures
                        </ConfirmButton>
                        <button className="btn-secondary" disabled={!changed} onClick={() => setDraft(structuredClone(current.book))}>
                            Discard edits
                        </button>
                        <button className="btn-primary" disabled={!changed || problems.length > 0 || saving} onClick={save}>
                            <Save size={14} /> {saving ? 'Saving…' : `Save as v${(current.version || 0) + 1}`}
                        </button>
                    </div>
                    {message && <div className={`calc-note ${message.kind}`}>{message.text}</div>}
                    {problems.length > 0 && (
                        <div className="calc-notes">
                            {problems.slice(0, 6).map((p) => (
                                <div key={p} className="calc-note err">{p}</div>
                            ))}
                        </div>
                    )}
                    {changed && problems.length === 0 && (
                        <div className="calc-note warn">Unsaved edits. Jobs keep pricing from v{current.version || 0} until you save.</div>
                    )}
                    <div className="calc-pbnav" role="tablist">
                        {SECTIONS.map(([k, l]) => (
                            <button key={k} role="tab" aria-selected={section === k} onClick={() => setSection(k)}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="calc-panel">
                <div className="body" style={{ gap: 12 }}>
                    {section === 'sheets' && (
                        <>
                            <p className="hint" style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                                Every sheet you can buy and what it costs. <b>Use</b> decides whether it is a tray or an
                                aperture material; untick <b>active</b> to retire a size and keep its price. Trays are
                                cut as strips down the sheet and joined end to end where they run longer.
                            </p>
                            <Rows
                                head={['Material', 'Width mm', 'Height mm', 'Cost £', 'Use', 'Active']}
                                rows={draft.sheets}
                                onAdd={() => upd((b) => void b.sheets.push({ id: newId(), material: 'New material', w: 2440, h: 1220, price_pence: 0, use: 'panel', active: true }))}
                                onRemove={(i) => upd((b) => void b.sheets.splice(i, 1))}
                                render={(s, i) => [
                                    <input key="m" className="calc-input" value={s.material} onChange={(e) => upd((b) => void (b.sheets[i].material = e.target.value))} />,
                                    <NumberInput key="w" className="w-num" value={s.w} onChange={(v) => upd((b) => void (b.sheets[i].w = v ?? 0))} />,
                                    <NumberInput key="h" className="w-num" value={s.h} onChange={(v) => upd((b) => void (b.sheets[i].h = v ?? 0))} />,
                                    <MoneyInput key="p" className="w-num" pence={s.price_pence} onChange={(v) => upd((b) => void (b.sheets[i].price_pence = v))} />,
                                    <select key="u" className="calc-input" value={s.use} onChange={(e) => upd((b) => void (b.sheets[i].use = e.target.value as 'panel' | 'aperture'))}>
                                        <option value="panel">panel</option>
                                        <option value="aperture">aperture</option>
                                    </select>,
                                    <input key="a" type="checkbox" aria-label="Active" checked={s.active} onChange={(e) => upd((b) => void (b.sheets[i].active = e.target.checked))} />,
                                ]}
                            />
                        </>
                    )}

                    {section === 'finishes' && (
                        <>
                            <p className="hint" style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                                Charged on the flat development — face plus returns. Keep a <b>None</b> row so
                                unfinished trays can be priced.
                            </p>
                            <Rows
                                head={['Finish', 'Cost per m² £']}
                                rows={draft.panel_finishes}
                                onAdd={() => upd((b) => void b.panel_finishes.push({ id: newId(), name: 'New finish', cost_per_m2_pence: 0 }))}
                                onRemove={(i) => upd((b) => void b.panel_finishes.splice(i, 1))}
                                render={(f, i) => [
                                    <input key="n" className="calc-input" value={f.name} onChange={(e) => upd((b) => void (b.panel_finishes[i].name = e.target.value))} />,
                                    <MoneyInput key="c" className="w-num" pence={f.cost_per_m2_pence} onChange={(v) => upd((b) => void (b.panel_finishes[i].cost_per_m2_pence = v))} />,
                                ]}
                            />
                        </>
                    )}

                    {section === 'labour' && (
                        <>
                            <p className="hint" style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                                Sell rates per hour, charged as-is. Rename freely — signs keep their hours. Joins add their
                                allowance to the rate marked <b>fabrication</b>.
                            </p>
                            <Rows
                                head={['Operation', 'Rate per hour £', 'Fabrication']}
                                rows={draft.labour}
                                onAdd={() => upd((b) => void b.labour.push({ id: newId(), name: 'New operation', rate_pence: 0, is_fabrication: false }))}
                                onRemove={(i) => upd((b) => void b.labour.splice(i, 1))}
                                render={(l, i) => [
                                    <input key="n" className="calc-input" value={l.name} onChange={(e) => upd((b) => void (b.labour[i].name = e.target.value))} />,
                                    <MoneyInput key="r" className="w-num" pence={l.rate_pence} onChange={(v) => upd((b) => void (b.labour[i].rate_pence = v))} />,
                                    <input
                                        key="f"
                                        type="radio"
                                        name="fab"
                                        aria-label="Joins are charged to this rate"
                                        checked={l.is_fabrication}
                                        onChange={() => upd((b) => b.labour.forEach((x, j) => (x.is_fabrication = j === i)))}
                                    />,
                                ]}
                            />
                        </>
                    )}

                    {section === 'letters' && (
                        <>
                            <p className="hint" style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                                SELL prices per letter, markup already in, by letter height in mm.
                            </p>
                            {draft.letter_types.map((t, ti) => (
                                <div key={t.id} className="calc-sec">
                                    <h3>
                                        <input
                                            className="calc-input"
                                            style={{ width: 200 }}
                                            aria-label="Letter type name"
                                            value={t.name}
                                            onChange={(e) => upd((b) => void (b.letter_types[ti].name = e.target.value))}
                                        />
                                        <span className="right calc-actions">
                                            <button
                                                className="btn-secondary"
                                                style={{ padding: '4px 10px', fontSize: 12 }}
                                                onClick={() => upd((b) => void b.letter_types[ti].finishes.push({ id: newId(), name: 'New finish', prices_pence: H.map(() => 0) }))}
                                            >
                                                <Plus size={13} /> Finish
                                            </button>
                                            <ConfirmButton
                                                style={{ padding: '4px 10px', fontSize: 12 }}
                                                question={`Remove ${t.name}?`}
                                                onConfirm={() => upd((b) => void b.letter_types.splice(ti, 1))}
                                            >
                                                <Trash2 size={13} /> Type
                                            </ConfirmButton>
                                        </span>
                                    </h3>
                                    <div className="calc-tablewrap">
                                        <table className="calc-table matrix">
                                            <thead>
                                                <tr>
                                                    <th>Finish</th>
                                                    {H.map((h) => <th key={h} className="num">{h}</th>)}
                                                    <th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {t.finishes.map((f, fi) => (
                                                    <tr key={f.id}>
                                                        <td>
                                                            <input
                                                                className="calc-input"
                                                                style={{ width: 150, textAlign: 'left' }}
                                                                value={f.name}
                                                                onChange={(e) => upd((b) => void (b.letter_types[ti].finishes[fi].name = e.target.value))}
                                                            />
                                                        </td>
                                                        {H.map((h, hi) => (
                                                            <td key={h} className="num">
                                                                <MoneyInput
                                                                    ariaLabel={`${t.name} ${f.name} ${h}mm`}
                                                                    pence={f.prices_pence[hi] ?? 0}
                                                                    onChange={(v) => upd((b) => void (b.letter_types[ti].finishes[fi].prices_pence[hi] = v))}
                                                                />
                                                            </td>
                                                        ))}
                                                        <td>
                                                            <button
                                                                className="calc-iconbtn"
                                                                aria-label="Remove finish"
                                                                onClick={() => upd((b) => void b.letter_types[ti].finishes.splice(fi, 1))}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                            <div className="calc-actions">
                                <button
                                    className="btn-secondary"
                                    onClick={() => upd((b) => void b.letter_types.push({ id: newId(), name: 'New type', finishes: [{ id: newId(), name: 'Unfinished', prices_pence: H.map(() => 0) }] }))}
                                >
                                    <Plus size={14} /> Letter type
                                </button>
                            </div>
                        </>
                    )}

                    {section === 'illum' && (
                        <>
                            <p className="hint" style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                                LEDs and the SELL price per lit letter, by height. Not marked up again.
                            </p>
                            <div className="calc-tablewrap">
                                <table className="calc-table matrix">
                                    <thead>
                                        <tr>
                                            <th>Height mm</th>
                                            {H.map((h) => <th key={h} className="num">{h}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>LEDs per letter</td>
                                            {H.map((h, i) => (
                                                <td key={h} className="num">
                                                    <NumberInput integer ariaLabel={`LEDs at ${h}mm`} value={draft.illumination.leds_per_letter[i] ?? 0} onChange={(v) => upd((b) => void (b.illumination.leds_per_letter[i] = v ?? 0))} />
                                                </td>
                                            ))}
                                        </tr>
                                        <tr>
                                            <td>Price per letter £</td>
                                            {H.map((h, i) => (
                                                <td key={h} className="num">
                                                    <MoneyInput ariaLabel={`Illumination price at ${h}mm`} pence={draft.illumination.price_per_letter_pence[i] ?? 0} onChange={(v) => upd((b) => void (b.illumination.price_per_letter_pence[i] = v))} />
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {section === 'transformers' && (
                        <>
                            <p className="hint" style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                                The calculator picks whichever type costs least for the LED count, unless a sign fixes one.
                                Keep at least one.
                            </p>
                            <Rows
                                head={['Type', 'Max LEDs', 'Cost £']}
                                rows={draft.transformers}
                                onAdd={() => upd((b) => void b.transformers.push({ id: newId(), name: 'New', max_leds: 100, price_pence: 0 }))}
                                onRemove={(i) => upd((b) => void b.transformers.splice(i, 1))}
                                render={(t, i) => [
                                    <input key="n" className="calc-input" value={t.name} onChange={(e) => upd((b) => void (b.transformers[i].name = e.target.value))} />,
                                    <NumberInput key="m" integer className="w-num" value={t.max_leds} onChange={(v) => upd((b) => void (b.transformers[i].max_leds = v ?? 0))} />,
                                    <MoneyInput key="p" className="w-num" pence={t.price_pence} onChange={(v) => upd((b) => void (b.transformers[i].price_pence = v))} />,
                                ]}
                            />
                        </>
                    )}

                    {section === 'settings' && <SettingsForm draft={draft} upd={upd} />}

                    {section === 'history' && (
                        <div className="calc-tablewrap">
                            {!history ? (
                                <div className="calc-empty">Loading…</div>
                            ) : history.length === 0 ? (
                                <div className="calc-empty">No versions saved yet — the calculator is using Mak’s built-in figures.</div>
                            ) : (
                                <table className="calc-table">
                                    <thead>
                                        <tr><th>Version</th><th>Saved</th><th>By</th><th>Note</th></tr>
                                    </thead>
                                    <tbody>
                                        {history.map((h) => (
                                            <tr key={h.version}>
                                                <td className="mono">v{h.version}</td>
                                                <td>{new Date(h.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                                <td>{h.created_by_email ?? '—'}</td>
                                                <td>{h.note ?? ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

function Rows<T extends { id: string }>({
    head,
    rows,
    render,
    onAdd,
    onRemove,
}: {
    head: string[];
    rows: T[];
    render: (row: T, i: number) => React.ReactNode[];
    onAdd: () => void;
    onRemove: (i: number) => void;
}) {
    return (
        <>
            <div className="calc-tablewrap">
                <table className="calc-table">
                    <thead>
                        <tr>
                            {head.map((h) => <th key={h}>{h}</th>)}
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={r.id}>
                                {render(r, i).map((cell, j) => <td key={j}>{cell}</td>)}
                                <td>
                                    <button className="calc-iconbtn" aria-label="Remove row" onClick={() => onRemove(i)}>
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="calc-actions">
                <button className="btn-secondary" onClick={onAdd}>
                    <Plus size={14} /> Add row
                </button>
            </div>
        </>
    );
}

function SettingsForm({ draft, upd }: { draft: PriceBook; upd: (fn: (b: PriceBook) => void) => void }) {
    const S = draft.settings;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="calc-grid3">
                <Field label="Materials markup %">
                    <NumberInput value={S.markup_pct} onChange={(v) => upd((b) => void (b.settings.markup_pct = v ?? 0))} />
                </Field>
                <Field label="VAT %">
                    <NumberInput step={0.5} value={S.vat_pct} onChange={(v) => upd((b) => void (b.settings.vat_pct = v ?? 0))} />
                </Field>
                <Field label="Joint allowance (fabrication hrs per join)">
                    <NumberInput step={0.25} value={S.joint_allowance_hrs} onChange={(v) => upd((b) => void (b.settings.joint_allowance_hrs = v ?? 0))} />
                </Field>
                <Field label="Aperture LED grid (mm per LED)">
                    <NumberInput step={10} value={S.aperture_led_grid_mm} onChange={(v) => upd((b) => void (b.settings.aperture_led_grid_mm = Math.max(1, v ?? 200)))} />
                </Field>
                <Field label="Aperture LED cost each £">
                    <MoneyInput pence={S.aperture_led_unit_cost_pence} onChange={(v) => upd((b) => void (b.settings.aperture_led_unit_cost_pence = v))} />
                </Field>
                <Field label="Aperture LED markup % (instead of materials markup)">
                    <NumberInput step={10} value={S.aperture_led_markup_pct} onChange={(v) => upd((b) => void (b.settings.aperture_led_markup_pct = v ?? 0))} />
                </Field>
                <Field label="Batches of the same sign">
                    <select className="calc-input" value={S.sheet_sharing} onChange={(e) => upd((b) => void (b.settings.sheet_sharing = e.target.value as 'batch' | 'per_sign'))}>
                        <option value="batch">share sheets across the batch</option>
                        <option value="per_sign">each sign buys its own sheet</option>
                    </select>
                </Field>
                <Field label="Cutting plan priority">
                    <select className="calc-input" value={S.cutting_priority} onChange={(e) => upd((b) => void (b.settings.cutting_priority = e.target.value as 'joins' | 'cost'))}>
                        <option value="joins">fewest joins, then cost</option>
                        <option value="cost">lowest total cost</option>
                    </select>
                </Field>
                <Field label="Letter heights between bands">
                    <select className="calc-input" value={S.height_policy} onChange={(e) => upd((b) => void (b.settings.height_policy = e.target.value as 'roundup' | 'nearest' | 'block'))}>
                        <option value="roundup">round up to the next band</option>
                        <option value="nearest">use the nearest band</option>
                        <option value="block">refuse and warn</option>
                    </select>
                </Field>
            </div>
            <div className="calc-note info">
                Aperture LEDs carry their own markup ({S.aperture_led_markup_pct}%) and are kept out of the materials
                markup, so they are marked up once. Mak&rsquo;s original charged them at cost and called that
                &ldquo;almost certainly an oversight&rdquo;; 300% matches the letter LEDs. Letter heights are fixed at{' '}
                {draft.heights[0]}–{draft.heights[draft.heights.length - 1]}mm in {draft.heights[1] - draft.heights[0]}mm steps;
                taller letters are extrapolated and flagged.
            </div>

            <ConfirmFigures draft={draft} upd={upd} />
        </div>
    );
}

/**
 * Signing the figures off.
 *
 * The book shipped as Mak's spreadsheet, including the numbers he flagged
 * himself as doubtful. Until someone who knows the real prices confirms them,
 * every page that prices from the book says so. Confirming stamps a name and
 * date into the draft; it takes effect when the book is saved.
 */
function ConfirmFigures({ draft, upd }: { draft: PriceBook; upd: (fn: (b: PriceBook) => void) => void }) {
    const S = draft.settings;
    const [name, setName] = useState('');
    const fab = draft.labour.find((l) => l.is_fabrication);
    const big = draft.sheets.find((s) => s.use === 'panel' && s.w === 3000 && s.h === 1500);
    return (
        <div className="calc-sec">
            <h3>Are these Onesign&rsquo;s real prices?</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
                Mak flagged these in his own file. Check each before quoting real work.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>
                    Fabrication {fab ? `is £${(fab.rate_pence / 100).toFixed(2)}/hr` : 'has no rate'} and assembly
                    {' '}£{((draft.labour.find((l) => /assembl/i.test(l.name))?.rate_pence ?? 0) / 100).toFixed(2)}/hr —
                    the old Apps Script charged £90 for both, the spreadsheet £65.
                </li>
                <li>
                    The 3000 × 1500 aluminium sheet {big ? `is £${(big.price_pence / 100).toFixed(2)}` : 'is not in the book'} — never
                    checked against a supplier price.
                </li>
                <li>Aperture LEDs are marked up {S.aperture_led_markup_pct}%.</li>
                <li>Installation, access, delivery, survey, artwork and electrical work are not calculated — they are typed per job.</li>
            </ul>
            {S.figures_confirmed_by ? (
                <div className="calc-actions">
                    <span className="calc-note info" style={{ flex: 1 }}>
                        Confirmed by {S.figures_confirmed_by}
                        {S.figures_confirmed_at ? ` on ${new Date(S.figures_confirmed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
                    </span>
                    <button
                        className="btn-secondary"
                        onClick={() =>
                            upd((b) => {
                                b.settings.figures_confirmed_by = null;
                                b.settings.figures_confirmed_at = null;
                            })
                        }
                    >
                        Withdraw
                    </button>
                </div>
            ) : (
                <div className="calc-actions">
                    <input
                        className="calc-input"
                        style={{ width: 220 }}
                        placeholder="Your name"
                        aria-label="Name of the person confirming the figures"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <button
                        className="btn-primary"
                        disabled={!name.trim()}
                        onClick={() =>
                            upd((b) => {
                                b.settings.figures_confirmed_by = name.trim().slice(0, 120);
                                b.settings.figures_confirmed_at = new Date().toISOString();
                            })
                        }
                    >
                        These are our real prices
                    </button>
                    <span className="hint" style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
                        Takes effect when you save the price book.
                    </span>
                </div>
            )}
        </div>
    );
}
