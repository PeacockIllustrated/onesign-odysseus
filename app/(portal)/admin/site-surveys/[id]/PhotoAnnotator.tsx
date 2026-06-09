'use client';

import { useRef, useState, useTransition } from 'react';
import {
    X,
    Ruler,
    MapPin,
    Type,
    MousePointer2,
    Trash2,
    Loader2,
} from 'lucide-react';
import { updatePhoto } from '@/lib/site-surveys/actions';
import type { Annotation, SurveyPhotoWithUrl } from '@/lib/site-surveys/types';

type Tool = 'select' | 'measure' | 'pin' | 'note';
type Pt = [number, number];

const MEASURE = '#e11d48';
const PIN = '#2563eb';
const NOTE_BG = '#111827';
const SEL = '#f59e0b';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function nextPinN(annos: Annotation[]): number {
    let max = 0;
    for (const a of annos) if (a.kind === 'pin' && a.n > max) max = a.n;
    return max + 1;
}

function textOf(a: Annotation): string {
    if (a.kind === 'measure') return a.label;
    if (a.kind === 'pin') return a.note;
    if (a.kind === 'note') return a.text;
    return a.label;
}

function withText(a: Annotation, v: string): Annotation {
    if (a.kind === 'measure') return { ...a, label: v };
    if (a.kind === 'pin') return { ...a, note: v };
    if (a.kind === 'note') return { ...a, text: v };
    return { ...a, label: v };
}

const TOOLS: { key: Tool; label: string; Icon: typeof Ruler }[] = [
    { key: 'measure', label: 'Measure', Icon: Ruler },
    { key: 'pin', label: 'Pin', Icon: MapPin },
    { key: 'note', label: 'Note', Icon: Type },
    { key: 'select', label: 'Select', Icon: MousePointer2 },
];

export function PhotoAnnotator({
    photo,
    onClose,
    onSaved,
}: {
    photo: SurveyPhotoWithUrl;
    onClose: () => void;
    onSaved: (result: {
        annotations: Annotation[];
        caption: string | null;
        sign_width_mm: number | null;
        sign_height_mm: number | null;
    }) => void;
}) {
    const [annos, setAnnos] = useState<Annotation[]>(photo.annotations_json ?? []);
    const [caption, setCaption] = useState(photo.caption ?? '');
    const [signW, setSignW] = useState(
        photo.sign_width_mm != null ? String(photo.sign_width_mm) : '',
    );
    const [signH, setSignH] = useState(
        photo.sign_height_mm != null ? String(photo.sign_height_mm) : '',
    );
    const [tool, setTool] = useState<Tool>('measure');
    const [pendingA, setPendingA] = useState<Pt | null>(null);
    const [cursor, setCursor] = useState<Pt | null>(null);
    const [sel, setSel] = useState<number | null>(null);
    const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, startSave] = useTransition();
    const svgRef = useRef<SVGSVGElement>(null);

    const W = nat?.w ?? 1000;
    const H = nat?.h ?? 1000;
    const u = Math.max(W, H) / 100; // sizing unit so markup scales with resolution

    function pointFromEvent(e: React.MouseEvent | React.PointerEvent): Pt {
        const el = svgRef.current;
        if (!el) return [0, 0];
        const rect = el.getBoundingClientRect();
        return [
            clamp01((e.clientX - rect.left) / rect.width),
            clamp01((e.clientY - rect.top) / rect.height),
        ];
    }

    function commit(a: Annotation) {
        setAnnos((prev) => {
            const next = [...prev, a];
            setSel(next.length - 1);
            return next;
        });
    }

    function handleBgClick(e: React.MouseEvent) {
        if (!nat) return;
        const p = pointFromEvent(e);
        if (tool === 'select') {
            setSel(null);
            return;
        }
        if (tool === 'measure') {
            if (!pendingA) setPendingA(p);
            else {
                commit({ kind: 'measure', a: pendingA, b: p, label: '' });
                setPendingA(null);
            }
            return;
        }
        if (tool === 'pin') {
            commit({ kind: 'pin', at: p, n: nextPinN(annos), note: '' });
            return;
        }
        if (tool === 'note') commit({ kind: 'note', at: p, text: '' });
    }

    function updateSelText(v: string) {
        if (sel === null) return;
        setAnnos((prev) => prev.map((a, i) => (i === sel ? withText(a, v) : a)));
    }

    function deleteSel() {
        if (sel === null) return;
        setAnnos((prev) => prev.filter((_, i) => i !== sel));
        setSel(null);
    }

    function save() {
        setError(null);
        const parseMm = (s: string): number | null => {
            const t = s.trim();
            if (t === '') return null;
            const v = Number(t);
            return Number.isFinite(v) && v >= 0 ? v : null;
        };
        const cap = caption.trim() === '' ? null : caption.trim();
        const w = parseMm(signW);
        const h = parseMm(signH);
        startSave(async () => {
            const res = await updatePhoto({
                photoId: photo.id,
                annotations: annos,
                caption: cap,
                sign_width_mm: w,
                sign_height_mm: h,
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            onSaved({ annotations: annos, caption: cap, sign_width_mm: w, sign_height_mm: h });
            onClose();
        });
    }

    const selText = sel !== null && annos[sel] ? textOf(annos[sel]) : '';

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-50">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-[#4e7e8c] px-4 py-2.5 text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Ruler size={16} /> Annotate photo
                </div>
                <button
                    onClick={onClose}
                    className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2">
                {TOOLS.map(({ key, label, Icon }) => (
                    <button
                        key={key}
                        onClick={() => {
                            setTool(key);
                            setPendingA(null);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            tool === key
                                ? 'bg-[#4e7e8c] text-white shadow-sm'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                    >
                        <Icon size={14} /> {label}
                    </button>
                ))}
                <span className="ml-1 text-xs text-neutral-500">
                    {tool === 'measure'
                        ? pendingA
                            ? 'tap the end point'
                            : 'tap the start point, then the end'
                        : tool === 'pin'
                          ? 'tap to drop a numbered pin'
                          : tool === 'note'
                            ? 'tap to place a note'
                            : 'tap a marking to edit or delete it'}
                </span>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-auto bg-neutral-100 p-4">
                <div className="relative mx-auto max-w-3xl select-none">
                    {photo.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={photo.url}
                            alt="survey"
                            draggable={false}
                            onLoad={(e) =>
                                setNat({
                                    w: e.currentTarget.naturalWidth,
                                    h: e.currentTarget.naturalHeight,
                                })
                            }
                            className="block h-auto w-full rounded"
                        />
                    ) : (
                        <div className="rounded bg-neutral-200 p-12 text-center text-sm text-neutral-500">
                            Image unavailable
                        </div>
                    )}

                    {nat && (
                        <svg
                            ref={svgRef}
                            viewBox={`0 0 ${W} ${H}`}
                            className="absolute inset-0 h-full w-full"
                            style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
                            onClick={handleBgClick}
                            onPointerMove={(e) =>
                                pendingA && setCursor(pointFromEvent(e))
                            }
                        >
                            <defs>
                                <marker
                                    id="svy-anno-arrow"
                                    markerWidth="9"
                                    markerHeight="9"
                                    refX="7.5"
                                    refY="4"
                                    orient="auto-start-reverse"
                                    markerUnits="userSpaceOnUse"
                                >
                                    <path d={`M0,0 L${u}, ${u / 2} L0,${u} Z`} fill={MEASURE} />
                                </marker>
                            </defs>

                            {/* pending measure preview */}
                            {pendingA && cursor && (
                                <line
                                    x1={pendingA[0] * W}
                                    y1={pendingA[1] * H}
                                    x2={cursor[0] * W}
                                    y2={cursor[1] * H}
                                    stroke={MEASURE}
                                    strokeWidth={u * 0.4}
                                    strokeDasharray={`${u} ${u}`}
                                    opacity={0.7}
                                />
                            )}

                            {annos.map((a, i) => {
                                const selected = i === sel;
                                const onPick = (e: React.MouseEvent) => {
                                    if (tool === 'select') {
                                        e.stopPropagation();
                                        setSel(i);
                                    }
                                };
                                if (a.kind === 'measure') {
                                    const ax = a.a[0] * W,
                                        ay = a.a[1] * H,
                                        bx = a.b[0] * W,
                                        by = a.b[1] * H;
                                    const mx = (ax + bx) / 2,
                                        my = (ay + by) / 2;
                                    return (
                                        <g key={i} onClick={onPick} style={{ cursor: 'pointer' }}>
                                            <line
                                                x1={ax}
                                                y1={ay}
                                                x2={bx}
                                                y2={by}
                                                stroke={selected ? SEL : MEASURE}
                                                strokeWidth={u * 0.45}
                                                markerStart="url(#svy-anno-arrow)"
                                                markerEnd="url(#svy-anno-arrow)"
                                            />
                                            {a.label && (
                                                <AnnoLabel x={mx} y={my} text={a.label} u={u} bg="#fff" fg="#111" />
                                            )}
                                        </g>
                                    );
                                }
                                if (a.kind === 'pin') {
                                    const x = a.at[0] * W,
                                        y = a.at[1] * H;
                                    return (
                                        <g key={i} onClick={onPick} style={{ cursor: 'pointer' }}>
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r={u * 2.4}
                                                fill={PIN}
                                                stroke={selected ? SEL : '#fff'}
                                                strokeWidth={u * 0.4}
                                            />
                                            <text
                                                x={x}
                                                y={y}
                                                fontSize={u * 2.8}
                                                fontFamily="ui-sans-serif, system-ui, sans-serif"
                                                fontWeight={700}
                                                textAnchor="middle"
                                                dominantBaseline="central"
                                                fill="#fff"
                                            >
                                                {a.n}
                                            </text>
                                        </g>
                                    );
                                }
                                if (a.kind === 'note') {
                                    const x = a.at[0] * W,
                                        y = a.at[1] * H;
                                    return (
                                        <g key={i} onClick={onPick} style={{ cursor: 'pointer' }}>
                                            <circle cx={x} cy={y} r={u * 0.8} fill={NOTE_BG} />
                                            <AnnoLabel
                                                x={x + u * 1.2}
                                                y={y}
                                                text={a.text || 'note'}
                                                u={u}
                                                bg={NOTE_BG}
                                                fg="#fff"
                                                anchor="start"
                                                outline={selected ? SEL : undefined}
                                            />
                                        </g>
                                    );
                                }
                                // rect — not drawable in the editor today, but
                                // render it if one arrives from elsewhere.
                                return (
                                    <g key={i} onClick={onPick} style={{ cursor: 'pointer' }}>
                                        <rect
                                            x={a.x * W}
                                            y={a.y * H}
                                            width={a.w * W}
                                            height={a.h * H}
                                            fill="none"
                                            stroke={selected ? SEL : MEASURE}
                                            strokeWidth={u * 0.45}
                                        />
                                        {a.label && (
                                            <AnnoLabel
                                                x={a.x * W + (a.w * W) / 2}
                                                y={a.y * H}
                                                text={a.label}
                                                u={u}
                                                bg="#fff"
                                                fg="#111"
                                            />
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                    )}
                </div>
            </div>

            {/* Footer controls */}
            <div className="space-y-2 border-t border-neutral-200 bg-white px-4 py-3">
                {sel !== null && annos[sel] && (
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={selText}
                            onChange={(e) => updateSelText(e.target.value)}
                            placeholder={
                                annos[sel].kind === 'measure'
                                    ? 'measurement e.g. 2400mm'
                                    : annos[sel].kind === 'pin'
                                      ? 'pin note'
                                      : 'note text'
                            }
                            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-[#e8f0f3]"
                        />
                        <button
                            onClick={deleteSel}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                        >
                            <Trash2 size={14} /> delete
                        </button>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-500">
                        Size (mm)
                    </span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={signW}
                        onChange={(e) => setSignW(e.target.value)}
                        placeholder="width"
                        className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-[#e8f0f3]"
                    />
                    <span className="text-neutral-400">×</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={signH}
                        onChange={(e) => setSignH(e.target.value)}
                        placeholder="height"
                        className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-[#e8f0f3]"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Caption (e.g. which sign / where)"
                        className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-[#e8f0f3]"
                    />
                    <button
                        onClick={onClose}
                        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                        cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-md bg-[#4e7e8c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3a5f6a] disabled:opacity-60"
                    >
                        {saving && <Loader2 size={14} className="animate-spin" />} save markup
                    </button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
        </div>
    );
}

function AnnoLabel({
    x,
    y,
    text,
    u,
    bg,
    fg,
    anchor = 'middle',
    outline,
}: {
    x: number;
    y: number;
    text: string;
    u: number;
    bg: string;
    fg: string;
    anchor?: 'middle' | 'start';
    outline?: string;
}) {
    const fs = u * 3;
    const w = text.length * fs * 0.6 + u * 2;
    const h = fs + u * 1.4;
    const rx = anchor === 'start' ? x : x - w / 2;
    return (
        <g>
            <rect
                x={rx}
                y={y - h / 2}
                width={w}
                height={h}
                rx={u * 0.6}
                fill={bg}
                opacity={0.92}
                stroke={outline}
                strokeWidth={outline ? u * 0.4 : 0}
            />
            <text
                x={anchor === 'start' ? x + u : x}
                y={y}
                fontSize={fs}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontWeight={600}
                textAnchor={anchor}
                dominantBaseline="central"
                fill={fg}
            >
                {text}
            </text>
        </g>
    );
}
