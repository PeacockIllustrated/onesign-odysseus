'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
    X,
    Ruler,
    MapPin,
    Type,
    MousePointer2,
    Trash2,
    Loader2,
    ZoomIn,
    ZoomOut,
    Check,
} from 'lucide-react';
import { updatePhoto } from '@/lib/site-surveys/actions';
import type { Annotation, SurveyPhotoWithUrl } from '@/lib/site-surveys/types';

type Tool = 'select' | 'measure' | 'pin' | 'note';
type Pt = [number, number];

const MEASURE = '#e11d48';
const PIN = '#2563eb';
const NOTE_BG = '#111827';
const SEL = '#f59e0b';
const MAX_ZOOM = 6;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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
    const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });

    const svgRef = useRef<SVGSVGElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const selInputRef = useRef<HTMLInputElement>(null);
    const scaleRef = useRef(1);
    const ptrs = useRef(new Map<number, { x: number; y: number }>());
    const gest = useRef({
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        moved: false,
        suppress: false,
        pinchDist: 0,
        midX: 0,
        midY: 0,
    });

    const W = nat?.w ?? 1000;
    const H = nat?.h ?? 1000;
    const u = Math.max(W, H) / 100;

    useEffect(() => {
        scaleRef.current = view.scale;
    }, [view.scale]);

    // Focus the entry box whenever a marking is selected (so a fresh measure
    // jumps straight to the number keypad).
    useEffect(() => {
        if (sel !== null) selInputRef.current?.focus();
    }, [sel]);

    // Wheel zoom (desktop), non-passive so we can preventDefault.
    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            const cx = e.clientX - r.left;
            const cy = e.clientY - r.top;
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            setView((v) => {
                const ns = clamp(v.scale * factor, 1, MAX_ZOOM);
                if (ns === v.scale) return v;
                const k = ns / v.scale;
                let tx = cx - k * (cx - v.tx);
                let ty = cy - k * (cy - v.ty);
                if (ns === 1) {
                    tx = 0;
                    ty = 0;
                }
                return { scale: ns, tx, ty };
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    function zoomAbout(cx: number, cy: number, factor: number) {
        setView((v) => {
            const ns = clamp(v.scale * factor, 1, MAX_ZOOM);
            if (ns === v.scale) return v;
            const k = ns / v.scale;
            let tx = cx - k * (cx - v.tx);
            let ty = cy - k * (cy - v.ty);
            if (ns === 1) {
                tx = 0;
                ty = 0;
            }
            return { scale: ns, tx, ty };
        });
    }
    function zoomButton(factor: number) {
        const r = viewportRef.current?.getBoundingClientRect();
        if (!r) return;
        zoomAbout(r.width / 2, r.height / 2, factor);
    }

    function pointFromEvent(e: { clientX: number; clientY: number }): Pt {
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

    function placeAt(p: Pt) {
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

    // ---- pointer: tap = place, drag (when zoomed) = pan, 2-finger = pinch ----
    function onPointerDown(e: React.PointerEvent) {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gest.current;
        if (ptrs.current.size === 1) {
            g.startX = e.clientX;
            g.startY = e.clientY;
            g.lastX = e.clientX;
            g.lastY = e.clientY;
            g.moved = false;
            g.suppress = false;
        } else if (ptrs.current.size === 2) {
            g.suppress = true;
            const p = [...ptrs.current.values()];
            const r = viewportRef.current!.getBoundingClientRect();
            g.pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
            g.midX = (p[0].x + p[1].x) / 2 - r.left;
            g.midY = (p[0].y + p[1].y) / 2 - r.top;
        }
    }

    function onPointerMove(e: React.PointerEvent) {
        const g = gest.current;
        if (!ptrs.current.has(e.pointerId)) {
            if (pendingA && tool === 'measure') setCursor(pointFromEvent(e));
            return;
        }
        ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (ptrs.current.size >= 2) {
            const p = [...ptrs.current.values()];
            const r = viewportRef.current!.getBoundingClientRect();
            const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
            const midX = (p[0].x + p[1].x) / 2 - r.left;
            const midY = (p[0].y + p[1].y) / 2 - r.top;
            if (g.pinchDist > 0) {
                const factor = dist / g.pinchDist;
                const panDX = midX - g.midX;
                const panDY = midY - g.midY;
                setView((v) => {
                    const ns = clamp(v.scale * factor, 1, MAX_ZOOM);
                    const k = ns / v.scale;
                    let tx = midX - k * (midX - v.tx) + panDX;
                    let ty = midY - k * (midY - v.ty) + panDY;
                    if (ns === 1) {
                        tx = 0;
                        ty = 0;
                    }
                    return { scale: ns, tx, ty };
                });
            }
            g.pinchDist = dist;
            g.midX = midX;
            g.midY = midY;
            g.moved = true;
            g.suppress = true;
            return;
        }

        if (pendingA && tool === 'measure') setCursor(pointFromEvent(e));
        const dx = e.clientX - g.lastX;
        const dy = e.clientY - g.lastY;
        if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 6)
            g.moved = true;
        if (g.moved && scaleRef.current > 1) {
            g.suppress = true;
            setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        }
        g.lastX = e.clientX;
        g.lastY = e.clientY;
    }

    function onPointerUp(e: React.PointerEvent) {
        ptrs.current.delete(e.pointerId);
        if (ptrs.current.size < 2) gest.current.pinchDist = 0;
    }

    function onBgClick(e: React.MouseEvent) {
        if (gest.current.suppress) {
            gest.current.suppress = false;
            return;
        }
        if (!nat) return;
        placeAt(pointFromEvent(e));
    }

    function updateSelText(v: string) {
        if (sel === null) return;
        setAnnos((prev) => prev.map((a, i) => (i === sel ? withText(a, v) : a)));
    }

    function confirmSel() {
        if (sel === null) return;
        const a = annos[sel];
        if (a && a.kind === 'measure') {
            const v = a.label.trim();
            if (/^[\d.]+$/.test(v)) updateSelText(`${v} mm`);
        }
        setSel(null); // tool stays as-is (measure) → ready for the next one
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

    const selAnno = sel !== null ? annos[sel] : null;
    const isMeasureSel = selAnno?.kind === 'measure';
    const pct = Math.round(view.scale * 100);

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
                            ? 'tap the other end of the line'
                            : 'tap each end of what you’re measuring'
                        : tool === 'pin'
                          ? 'tap to drop a numbered pin'
                          : tool === 'note'
                            ? 'tap to place a note'
                            : 'tap a marking to edit or delete it'}
                </span>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-hidden bg-neutral-100 p-3">
                <div
                    ref={viewportRef}
                    className="relative mx-auto w-full max-w-3xl touch-none overflow-hidden rounded bg-neutral-200"
                >
                    <div
                        style={{
                            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                            transformOrigin: '0 0',
                        }}
                    >
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
                                className="block h-auto w-full select-none"
                            />
                        ) : (
                            <div className="p-12 text-center text-sm text-neutral-500">
                                Image unavailable
                            </div>
                        )}

                        {nat && (
                            <svg
                                ref={svgRef}
                                viewBox={`0 0 ${W} ${H}`}
                                className="absolute inset-0 h-full w-full"
                                style={{
                                    touchAction: 'none',
                                    cursor: tool === 'select' ? 'default' : 'crosshair',
                                }}
                                onClick={onBgClick}
                                onPointerDown={onPointerDown}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerUp}
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
                                        if (tool === 'select' && !gest.current.suppress) {
                                            e.stopPropagation();
                                            setSel(i);
                                        }
                                    };
                                    if (a.kind === 'measure') {
                                        const ax = a.a[0] * W,
                                            ay = a.a[1] * H,
                                            bx = a.b[0] * W,
                                            by = a.b[1] * H;
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
                                                    <AnnoLabel
                                                        x={(ax + bx) / 2}
                                                        y={(ay + by) / 2}
                                                        text={a.label}
                                                        u={u}
                                                        bg="#fff"
                                                        fg="#111"
                                                    />
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

                    {/* Zoom controls (not transformed) */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full border border-neutral-200 bg-white/95 px-1.5 py-1 shadow-md backdrop-blur">
                        <button
                            onClick={() => zoomButton(1 / 1.3)}
                            className="rounded-full p-1.5 text-neutral-600 hover:bg-neutral-100"
                            aria-label="Zoom out"
                        >
                            <ZoomOut size={16} />
                        </button>
                        <button
                            onClick={() => setView({ scale: 1, tx: 0, ty: 0 })}
                            className="min-w-[44px] rounded-full px-1 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                        >
                            {pct}%
                        </button>
                        <button
                            onClick={() => zoomButton(1.3)}
                            className="rounded-full p-1.5 text-neutral-600 hover:bg-neutral-100"
                            aria-label="Zoom in"
                        >
                            <ZoomIn size={16} />
                        </button>
                    </div>
                    {view.scale > 1 && (
                        <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
                            drag to move around
                        </div>
                    )}
                </div>
            </div>

            {/* Footer controls */}
            <div className="space-y-2 border-t border-neutral-200 bg-white px-4 py-3">
                {selAnno && (
                    <div className="flex items-center gap-2 rounded-lg bg-[#e8f0f3] p-2">
                        {isMeasureSel && (
                            <span className="pl-1 text-xs font-semibold text-[#3a5f6a]">
                                Measurement
                            </span>
                        )}
                        <input
                            ref={selInputRef}
                            value={textOf(selAnno)}
                            onChange={(e) => updateSelText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    confirmSel();
                                }
                            }}
                            inputMode={isMeasureSel ? 'decimal' : 'text'}
                            placeholder={
                                isMeasureSel
                                    ? 'type the size, e.g. 2400'
                                    : selAnno.kind === 'pin'
                                      ? 'pin note'
                                      : 'note text'
                            }
                            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-white"
                        />
                        {isMeasureSel && (
                            <span className="text-sm font-semibold text-neutral-500">mm</span>
                        )}
                        <button
                            onClick={confirmSel}
                            className="inline-flex items-center gap-1 rounded-md bg-[#4e7e8c] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3a5f6a]"
                        >
                            <Check size={14} /> done
                        </button>
                        <button
                            onClick={deleteSel}
                            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-500">
                        Sign size (mm)
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
