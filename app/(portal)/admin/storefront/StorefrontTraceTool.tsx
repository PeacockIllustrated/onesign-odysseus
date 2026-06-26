'use client';

/**
 * Trace-to-scale tool — the reliability core of the Storefront Studio.
 *
 * Upload the prospect's photo, set ONE known dimension (the anchor — ideally a
 * survey measurement), then draw a box around each element (whole shopfront,
 * fascia, door, window, stallriser). `traceToSpec` converts the traced pixels
 * to measured mm via the anchor and the live 3D rebuilds to scale. No eyeballed
 * proportions: the image + the anchor decide. (Loaded ssr:false by the client
 * wrapper, so the direct StorefrontScene import is safe.)
 */

import { useMemo, useRef, useState } from 'react';
import { RotateCcw, Upload } from 'lucide-react';
import StorefrontScene from './StorefrontScene';
import { traceToSpec, type PixelBox, type StorefrontSpec } from '@/lib/storefront';

type ElementKey = 'facade' | 'fascia' | 'door' | 'window' | 'stallriser';

const ELEMENTS: { key: ElementKey; label: string; colour: string; required: boolean }[] = [
    { key: 'facade', label: 'Whole shopfront', colour: '#475569', required: true },
    { key: 'fascia', label: 'Fascia banner', colour: '#f59e0b', required: true },
    { key: 'door', label: 'Door', colour: '#2563eb', required: true },
    { key: 'window', label: 'Window', colour: '#06b6d4', required: true },
    { key: 'stallriser', label: 'Stallriser (optional)', colour: '#22c55e', required: false },
];

type AnchorSource = 'door-h' | 'door-w' | 'window-w' | 'fascia-w' | 'facade-h' | 'facade-w';
const ANCHOR_SOURCES: { id: AnchorSource; label: string; el: ElementKey; dim: 'w' | 'h' }[] = [
    { id: 'door-h', label: 'Door height', el: 'door', dim: 'h' },
    { id: 'door-w', label: 'Door width', el: 'door', dim: 'w' },
    { id: 'window-w', label: 'Window width', el: 'window', dim: 'w' },
    { id: 'fascia-w', label: 'Fascia width', el: 'fascia', dim: 'w' },
    { id: 'facade-h', label: 'Shopfront height', el: 'facade', dim: 'h' },
    { id: 'facade-w', label: 'Shopfront width', el: 'facade', dim: 'w' },
];

type Boxes = Partial<Record<ElementKey, PixelBox>>;

export default function StorefrontTraceTool() {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [boxes, setBoxes] = useState<Boxes>({});
    const [activeTool, setActiveTool] = useState<ElementKey>('facade');
    const [draft, setDraft] = useState<PixelBox | null>(null);
    const [anchorSource, setAnchorSource] = useState<AnchorSource>('door-h');
    const [anchorMm, setAnchorMm] = useState<number>(2040); // standard UK door leaf
    const overlayRef = useRef<HTMLDivElement>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);

    const onFile = (f: File | undefined) => {
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => setImageUrl(reader.result as string);
        reader.readAsDataURL(f);
        setBoxes({});
    };

    const localPoint = (e: React.PointerEvent) => {
        const r = overlayRef.current!.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
            y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
        };
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (!imageUrl) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        const p = localPoint(e);
        startRef.current = p;
        setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!startRef.current) return;
        const p = localPoint(e);
        const s = startRef.current;
        setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
    };
    const onPointerUp = () => {
        if (draft && draft.w > 4 && draft.h > 4) {
            setBoxes((b) => ({ ...b, [activeTool]: draft }));
        }
        setDraft(null);
        startRef.current = null;
    };

    const anchorPx = useMemo(() => {
        const src = ANCHOR_SOURCES.find((s) => s.id === anchorSource)!;
        const box = boxes[src.el];
        return box ? box[src.dim] : 0;
    }, [boxes, anchorSource]);

    const spec: StorefrontSpec | null = useMemo(() => {
        const { facade, fascia, door, window: win } = boxes;
        if (!facade || !fascia || !door || !win || !anchorPx || !(anchorMm > 0)) return null;
        try {
            return traceToSpec({ anchorMm, anchorPx, facade, fascia, door, window: win, stallriser: boxes.stallriser });
        } catch {
            return null;
        }
    }, [boxes, anchorPx, anchorMm]);

    const missing = ELEMENTS.filter((e) => e.required && !boxes[e.key]).map((e) => e.label);

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {/* ---- trace panel ---- */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[#4e7e8c] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3a5f6a]">
                        <Upload size={14} aria-hidden /> {imageUrl ? 'Change photo' : 'Upload storefront photo'}
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onFile(e.target.files?.[0])}
                        />
                    </label>
                    {imageUrl && (
                        <button
                            type="button"
                            onClick={() => setBoxes({})}
                            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            <RotateCcw size={13} aria-hidden /> Clear boxes
                        </button>
                    )}
                </div>

                {imageUrl && (
                    <>
                        {/* element tool selector */}
                        <div className="flex flex-wrap gap-1.5">
                            {ELEMENTS.map((el) => (
                                <button
                                    key={el.key}
                                    type="button"
                                    onClick={() => setActiveTool(el.key)}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                                        activeTool === el.key ? 'text-white' : 'bg-white text-neutral-700 ring-neutral-300 hover:bg-neutral-50'
                                    }`}
                                    style={activeTool === el.key ? { background: el.colour, boxShadow: `0 0 0 1px ${el.colour}` } : undefined}
                                >
                                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: el.colour }} />
                                    {el.label}
                                    {boxes[el.key] ? ' ✓' : ''}
                                </button>
                            ))}
                        </div>

                        {/* image + drawing overlay */}
                        <div className="inline-block max-w-full select-none">
                            <div className="relative inline-block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imageUrl} alt="Storefront reference" className="block max-h-[58vh] w-auto max-w-full rounded-lg" />
                                <div
                                    ref={overlayRef}
                                    className="absolute inset-0 cursor-crosshair touch-none"
                                    onPointerDown={onPointerDown}
                                    onPointerMove={onPointerMove}
                                    onPointerUp={onPointerUp}
                                >
                                    {ELEMENTS.map((el) => {
                                        const b = boxes[el.key];
                                        if (!b) return null;
                                        return (
                                            <div
                                                key={el.key}
                                                className="absolute"
                                                style={{ left: b.x, top: b.y, width: b.w, height: b.h, border: `2px solid ${el.colour}`, background: `${el.colour}1a` }}
                                            >
                                                <span className="absolute -top-4 left-0 whitespace-nowrap rounded px-1 text-[10px] font-semibold text-white" style={{ background: el.colour }}>
                                                    {el.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {draft && (
                                        <div
                                            className="absolute border-2 border-dashed"
                                            style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h, borderColor: ELEMENTS.find((e) => e.key === activeTool)!.colour }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* anchor calibration */}
                        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                            <div>
                                <label className="block text-[11px] font-medium text-neutral-500">Anchor (known dimension)</label>
                                <select
                                    value={anchorSource}
                                    onChange={(e) => setAnchorSource(e.target.value as AnchorSource)}
                                    className="mt-1 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                                >
                                    {ANCHOR_SOURCES.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-neutral-500">= real size (mm)</label>
                                <input
                                    type="number"
                                    value={anchorMm}
                                    min={1}
                                    onChange={(e) => setAnchorMm(Number(e.target.value))}
                                    className="mt-1 w-28 rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
                                />
                            </div>
                            <p className="text-[11px] text-neutral-400">
                                Survey measurement is the best anchor. Fallback: a standard door leaf ≈ 2040 mm.
                            </p>
                        </div>
                    </>
                )}
            </div>

            {/* ---- live 3D ---- */}
            <div className="space-y-2">
                <div className="h-[58vh] w-full overflow-hidden rounded-xl border border-neutral-200 bg-[#e4f0f8]">
                    {spec ? (
                        <StorefrontScene spec={spec} />
                    ) : (
                        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-neutral-500">
                            {!imageUrl
                                ? 'Upload a storefront photo to begin.'
                                : missing.length
                                  ? `Draw a box around: ${missing.join(', ')}. Then set the anchor.`
                                  : anchorPx
                                    ? 'Enter the anchor’s real size in mm.'
                                    : 'Draw the element you chose as the anchor.'}
                        </div>
                    )}
                </div>
                {spec && (
                    <p className="text-xs text-neutral-500">
                        Reconstructed to scale: <strong>{spec.widthMm} × {spec.heightMm} mm</strong> · fascia{' '}
                        {Math.round((spec.fasciaHeightMm / spec.heightMm) * 100)}% · door {spec.door.widthMm}×{spec.doorHeadMm} mm.
                        The fascia is the empty sign mount.
                    </p>
                )}
            </div>
        </div>
    );
}
