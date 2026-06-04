'use client';

/**
 * Production Pack builder — the authoring surface for Tom & Davey.
 *
 * Holds the whole document in local state, edited via a visual block palette,
 * and saves it in one shot. Images upload client-side straight to the public
 * `production-packs` storage bucket (so we sidestep the server-action body
 * limit) and the returned public URL is stored on the block. Technical
 * drawings can be SVGs — we read their geometry client-side to auto-size them.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    AlignLeft,
    ArrowLeft,
    BadgeCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Copy,
    Eye,
    Heading as HeadingIcon,
    Image as ImageIcon,
    ImagePlus,
    Info,
    Link2,
    List,
    ListChecks,
    Loader2,
    Palette,
    Plus,
    Ruler,
    Save,
    Search,
    SeparatorHorizontal,
    Table2,
    Trash2,
    Upload,
    X,
    type LucideIcon,
} from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import {
    saveProductionPackContent,
    updateProductionPackMeta,
} from '@/lib/production-packs/actions';
import {
    BLOCK_META,
    PACK_STYLES,
    PALETTE_BLOCKS,
    genId,
    newBlock,
    newSection,
    type Block,
    type BlockType,
    type PackStyle,
    type ProductionPackContent,
    type ProductionPackStatus,
    type SignSection,
} from '@/lib/production-packs/types';
import { PRODUCTION_PACKS_BUCKET } from '@/lib/production-packs/utils';
import { ACRYLIC_COLOURS } from '@/lib/visualiser/acrylic';
import { RAL_CLASSIC } from '@/lib/visualiser/ral';

const inputCls =
    'w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1';

const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
    visual: ImageIcon,
    technical: Ruler,
    specTable: Table2,
    callouts: List,
    text: AlignLeft,
    stages: ListChecks,
    qc: BadgeCheck,
    heading: HeadingIcon,
    image: ImageIcon,
    pageBreak: SeparatorHorizontal,
};

// =============================================================================
// MATERIAL LIBRARY (shared with the visualiser — real orderable specs)
// =============================================================================

interface MaterialItem {
    hex: string;
    label: string;
    sub: string;
    /** The text dropped into the pack when picked. */
    text: string;
}

const MATERIAL_ITEMS: MaterialItem[] = [
    ...ACRYLIC_COLOURS.map((c) => ({
        hex: c.hex,
        label: `${c.name}${c.code ? ' ' + c.code : ''}`,
        sub: `${c.brand} · ${c.finish}`,
        text: `${c.brand} ${c.name}${c.code ? ' ' + c.code : ''}`,
    })),
    ...RAL_CLASSIC.map((r) => ({
        hex: r.hex,
        label: r.code,
        sub: r.name,
        text: `${r.code} — ${r.name}`,
    })),
];

/** A one-line summary of a block's content, for the collapsed row. */
function blockSummary(block: Block): string {
    switch (block.type) {
        case 'heading':
            return block.text || 'empty';
        case 'text':
            return block.title || (block.body ? block.body.slice(0, 48) : 'empty');
        case 'image':
        case 'visual':
            return block.url ? 'image set' : 'no image yet';
        case 'technical':
            return block.url
                ? block.widthMm != null
                    ? `${block.widthMm}×${block.heightMm ?? '?'} mm`
                    : 'drawing set'
                : 'no drawing yet';
        case 'specTable': {
            const n = block.rows.filter((r) => r.label || r.value).length;
            return `${n} ${n === 1 ? 'row' : 'rows'}`;
        }
        case 'callouts': {
            const n = block.items.filter(Boolean).length;
            return `${n} ${n === 1 ? 'item' : 'items'}`;
        }
        case 'stages': {
            const n = block.stages.filter((s) => s.name || s.instructions).length;
            return `${n} ${n === 1 ? 'stage' : 'stages'}`;
        }
        case 'qc': {
            const n = block.checks.filter((c) => c.label).length;
            return `${n} ${n === 1 ? 'check' : 'checks'}`;
        }
        case 'pageBreak':
            return '';
    }
}

// =============================================================================
// IMAGE / SVG HELPERS
// =============================================================================

/** Downscale large raster images client-side so packs stay light. SVGs pass
 *  through untouched (they're vector and tiny). Returns a Blob. */
async function downscale(file: File, maxDim = 2200): Promise<Blob> {
    if (file.type === 'image/svg+xml') return file;
    if (!file.type.startsWith('image/')) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        if (scale >= 1) return file;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, type, 0.92),
        );
        return blob ?? file;
    } catch {
        return file;
    }
}

function parseLength(s: string | null): { value: number; unit: string } | null {
    if (!s) return null;
    const m = s.trim().match(/^([0-9]*\.?[0-9]+)\s*([a-z%]*)$/i);
    if (!m) return null;
    return { value: parseFloat(m[1]), unit: (m[2] || '').toLowerCase() };
}

/** Convert a parsed SVG length to mm — only for physical units we can trust. */
function toMm(p: { value: number; unit: string } | null): number | null {
    if (!p) return null;
    switch (p.unit) {
        case 'mm': return Math.round(p.value);
        case 'cm': return Math.round(p.value * 10);
        case 'in': return Math.round(p.value * 25.4);
        case 'pt': return Math.round((p.value * 25.4) / 72);
        case 'pc': return Math.round((p.value * 25.4) / 6);
        default: return null; // px / unitless / % — not a real-world size
    }
}

/**
 * Read a drawing's intrinsic aspect ratio and, for SVGs, any real-world size
 * declared in physical units. Aspect comes from the viewBox (preferred) or the
 * width/height attributes; real mm only when the SVG states mm/cm/in.
 */
async function analyzeDrawing(
    file: File,
): Promise<{ isSvg: boolean; aspect: number; widthMm: number | null; heightMm: number | null }> {
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    if (isSvg) {
        try {
            const text = await file.text();
            const svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg');
            if (!svg) return { isSvg, aspect: 0, widthMm: null, heightMm: null };

            let vbW = 0;
            let vbH = 0;
            const vb = svg.getAttribute('viewBox');
            if (vb) {
                const p = vb.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
                if (p.length === 4) {
                    vbW = p[2];
                    vbH = p[3];
                }
            }
            const w = parseLength(svg.getAttribute('width'));
            const h = parseLength(svg.getAttribute('height'));

            let aspect = 0;
            if (vbW > 0 && vbH > 0) aspect = vbW / vbH;
            else if (w && h && w.value && h.value) aspect = w.value / h.value;

            let widthMm = toMm(w);
            let heightMm = toMm(h);
            if (widthMm && !heightMm && aspect > 0) heightMm = Math.round(widthMm / aspect);
            if (heightMm && !widthMm && aspect > 0) widthMm = Math.round(heightMm * aspect);

            return { isSvg, aspect, widthMm, heightMm };
        } catch {
            return { isSvg, aspect: 0, widthMm: null, heightMm: null };
        }
    }
    try {
        const bmp = await createImageBitmap(file);
        return {
            isSvg: false,
            aspect: bmp.height > 0 ? bmp.width / bmp.height : 0,
            widthMm: null,
            heightMm: null,
        };
    } catch {
        return { isSvg: false, aspect: 0, widthMm: null, heightMm: null };
    }
}

// =============================================================================
// PDF HELPERS (lazy-loaded; only when a PDF is actually picked)
// =============================================================================

function isPdf(file: File): boolean {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

let _pdfjs: typeof import('pdfjs-dist') | null = null;
async function getPdfjs() {
    if (!_pdfjs) {
        const mod = await import('pdfjs-dist');
        // Worker is vendored into /public so it loads from our own origin
        // (works offline on shop tablets; no bundler-worker guesswork).
        mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        _pdfjs = mod;
    }
    return _pdfjs;
}

async function pdfPageCount(file: File): Promise<number> {
    const pdfjs = await getPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const n = doc.numPages;
    await task.destroy();
    return n;
}

/** Rasterise one PDF page to a PNG File (so it flows through the normal image
 *  upload path) and report its aspect ratio. */
async function pdfPageToFile(
    file: File,
    pageNumber: number,
): Promise<{ file: File; aspect: number } | null> {
    const pdfjs = await getPdfjs();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    try {
        const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(4, 2000 / base.width);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png', 0.95));
        if (!blob) return null;
        return {
            file: new File([blob], `page-${pageNumber}.png`, { type: 'image/png' }),
            aspect: base.height > 0 ? base.width / base.height : 0,
        };
    } finally {
        await task.destroy();
    }
}

// =============================================================================
// BUILDER
// =============================================================================

export function PackBuilder({
    id,
    initialTitle,
    initialStatus,
    initialContent,
}: {
    id: string;
    initialTitle: string;
    initialStatus: ProductionPackStatus;
    initialContent: ProductionPackContent;
}) {
    const router = useRouter();
    const [title, setTitle] = useState(initialTitle);
    const [status, setStatus] = useState<ProductionPackStatus>(initialStatus);
    const [content, setContent] = useState<ProductionPackContent>(initialContent);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [coverOpen, setCoverOpen] = useState(true);
    const [showHelp, setShowHelp] = useState(true);
    const dismissHelp = () => setShowHelp(false);

    // One sign open at a time (accordion); blocks collapse to summaries.
    const [expandedSign, setExpandedSign] = useState<string | null>(
        () => initialContent.sections[0]?.id ?? null,
    );
    const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(() => new Set());
    const toggleSign = (sid: string) => setExpandedSign((cur) => (cur === sid ? null : sid));
    const toggleBlock = (bid: string) =>
        setExpandedBlocks((s) => {
            const n = new Set(s);
            if (n.has(bid)) n.delete(bid);
            else n.add(bid);
            return n;
        });

    const markDirty = useCallback(() => setDirty(true), []);

    /** Apply a mutation to a deep clone of the content. */
    const mutate = useCallback((fn: (draft: ProductionPackContent) => void) => {
        setContent((prev) => {
            const next = structuredClone(prev);
            fn(next);
            return next;
        });
        markDirty();
    }, [markDirty]);

    // Warn before leaving with unsaved edits.
    useEffect(() => {
        function onBeforeUnload(e: BeforeUnloadEvent) {
            if (!dirty) return;
            e.preventDefault();
            e.returnValue = '';
        }
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    const save = useCallback(async (): Promise<boolean> => {
        setSaving(true);
        const [contentRes, metaRes] = await Promise.all([
            saveProductionPackContent(id, content),
            updateProductionPackMeta(id, { title, status }),
        ]);
        setSaving(false);
        if (!contentRes.ok) {
            alert(contentRes.error);
            return false;
        }
        if (!metaRes.ok) {
            alert(metaRes.error);
            return false;
        }
        setDirty(false);
        router.refresh();
        return true;
    }, [id, content, title, status, router]);

    async function openPreview() {
        if (dirty) {
            const ok = await save();
            if (!ok) return;
        }
        window.open(`/admin/production-packs/${id}/print`, '_blank');
    }

    // ---- image upload ----
    const uploadImage = useCallback(
        async (file: File): Promise<string | null> => {
            const supabase = createBrowserClient();
            const blob = await downscale(file);
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const path = `${id}/${genId('img')}.${ext}`;
            const { error } = await supabase.storage
                .from(PRODUCTION_PACKS_BUCKET)
                .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
            if (error) {
                alert(`Upload failed: ${error.message}`);
                return null;
            }
            return supabase.storage.from(PRODUCTION_PACKS_BUCKET).getPublicUrl(path).data.publicUrl;
        },
        [id],
    );

    // ---- section + block ops ----
    const updateCover = (patch: Partial<ProductionPackContent['cover']>) =>
        mutate((d) => Object.assign(d.cover, patch));

    const updateStyle = (style: PackStyle) => mutate((d) => { d.style = style; });

    const addSection = () => {
        const sec = newSection(content.sections.length + 1);
        mutate((d) => d.sections.push(sec));
        setExpandedSign(sec.id);
    };
    const updateSection = (si: number, patch: Partial<SignSection>) =>
        mutate((d) => Object.assign(d.sections[si], patch));
    const removeSection = (si: number) => mutate((d) => d.sections.splice(si, 1));
    const duplicateSection = (si: number) =>
        mutate((d) => {
            const clone = structuredClone(d.sections[si]);
            clone.id = genId('sec');
            // Remap block ids, carrying the keep-with links across to the copies.
            const idMap = new Map<string, string>();
            clone.blocks = clone.blocks.map((b) => {
                const nid = genId('b');
                idMap.set(b.id, nid);
                return { ...b, id: nid };
            });
            clone.keepWith = clone.keepWith
                .map((id) => idMap.get(id))
                .filter((id): id is string => !!id);
            clone.title = `${clone.title} (copy)`;
            d.sections.splice(si + 1, 0, clone);
        });
    const moveSection = (si: number, dir: -1 | 1) =>
        mutate((d) => {
            const ti = si + dir;
            if (ti < 0 || ti >= d.sections.length) return;
            [d.sections[si], d.sections[ti]] = [d.sections[ti], d.sections[si]];
        });

    /** Toggle "keep with next" on a block (links it to the block below). */
    const toggleLink = (si: number, blockId: string) =>
        mutate((d) => {
            const s = d.sections[si];
            s.keepWith = s.keepWith.includes(blockId)
                ? s.keepWith.filter((x) => x !== blockId)
                : [...s.keepWith, blockId];
        });

    const addBlock = (si: number, type: BlockType) => {
        const b = newBlock(type);
        mutate((d) => d.sections[si].blocks.push(b));
        setExpandedBlocks((s) => new Set(s).add(b.id));
    };
    const replaceBlock = (si: number, bi: number, block: Block) =>
        mutate((d) => { d.sections[si].blocks[bi] = block; });
    const removeBlock = (si: number, bi: number) =>
        mutate((d) => d.sections[si].blocks.splice(bi, 1));
    const moveBlock = (si: number, bi: number, dir: -1 | 1) =>
        mutate((d) => {
            const ti = bi + dir;
            const blocks = d.sections[si].blocks;
            if (ti < 0 || ti >= blocks.length) return;
            [blocks[bi], blocks[ti]] = [blocks[ti], blocks[bi]];
        });

    const saveState = saving ? 'saving' : dirty ? 'unsaved' : 'saved';

    return (
        <div className="min-h-screen bg-neutral-50">
            {/* Toolbar */}
            <div className="sticky top-0 z-20 bg-white border-b border-neutral-200">
                <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Link
                        href="/admin/production-packs"
                        className="p-2 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-[var(--radius-sm)] transition-colors"
                        title="Back to packs"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <input
                        value={title}
                        onChange={(e) => { setTitle(e.target.value); markDirty(); }}
                        className="flex-1 min-w-0 px-2 py-1.5 text-base font-semibold border border-transparent hover:border-neutral-200 focus:border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                        placeholder="Pack title"
                    />
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value as ProductionPackStatus); markDirty(); }}
                        className="px-2 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    >
                        <option value="draft">draft</option>
                        <option value="ready">ready</option>
                        <option value="archived">archived</option>
                    </select>
                    <SaveStatePill state={saveState} />
                    <button
                        onClick={save}
                        disabled={saving || !dirty}
                        className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Save size={15} /> Save
                    </button>
                    <button
                        onClick={openPreview}
                        disabled={saving}
                        className="btn-secondary inline-flex items-center gap-1.5"
                        title="Save and open the print-ready works pack"
                    >
                        <Eye size={15} /> Preview / Print
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
                {showHelp && (
                    <div className="flex items-start gap-3 bg-[#e8f0f3] border border-[#4e7e8c]/30 rounded-[var(--radius-md)] px-4 py-3">
                        <Info size={16} className="text-[#4e7e8c] mt-0.5 shrink-0" />
                        <div className="flex-1 text-sm text-neutral-700">
                            <span className="font-semibold">How a pack works: </span>
                            fill the cover, then each <strong>sign</strong> is <strong>one A4 page</strong>. Click a sign
                            to open it, then click a block (visual, drawing, spec…) to fill it. Hit
                            <strong> Preview / Print</strong> when done.
                        </div>
                        <button onClick={dismissHelp} className="text-neutral-400 hover:text-black" title="Dismiss">
                            <X size={15} />
                        </button>
                    </div>
                )}

                <StyleBar value={content.style} onChange={updateStyle} />

                {/* Cover & title block */}
                <section className="bg-white border border-neutral-200 rounded-[var(--radius-md)]">
                    <button
                        onClick={() => setCoverOpen((o) => !o)}
                        className="w-full flex items-center justify-between px-5 py-3 text-left"
                    >
                        <span className="text-sm font-semibold">Cover &amp; title block</span>
                        {coverOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {coverOpen && (
                        <div className="px-5 pb-5 border-t border-neutral-100 pt-4 space-y-5">
                            <div>
                                <GroupHeading>Cover page</GroupHeading>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Client">
                                        <input className={inputCls} value={content.cover.clientName} onChange={(e) => updateCover({ clientName: e.target.value })} placeholder="e.g. Burger Drop" />
                                    </Field>
                                    <Field label="Project">
                                        <input className={inputCls} value={content.cover.projectName} onChange={(e) => updateCover({ projectName: e.target.value })} placeholder="e.g. Linthorpe Road rebrand" />
                                    </Field>
                                    <Field label="Subtitle / strapline">
                                        <input className={inputCls} value={content.cover.subtitle} onChange={(e) => updateCover({ subtitle: e.target.value })} placeholder="Signage works pack" />
                                    </Field>
                                    <Field label="Site address">
                                        <input className={inputCls} value={content.cover.siteAddress} onChange={(e) => updateCover({ siteAddress: e.target.value })} placeholder="176 Linthorpe Road, Middlesbrough, TS1 3RB" />
                                    </Field>
                                    <Field label="Client logo">
                                        <CoverLogo url={content.cover.logoUrl} onChange={(url) => updateCover({ logoUrl: url })} uploadImage={uploadImage} />
                                    </Field>
                                    <label className="flex items-center gap-2 text-sm text-neutral-700 self-end pb-2">
                                        <input type="checkbox" checked={content.cover.showWordmark} onChange={(e) => updateCover({ showWordmark: e.target.checked })} />
                                        Show client name as a wordmark
                                    </label>
                                </div>
                            </div>
                            <div>
                                <GroupHeading>Title block (foot of every page)</GroupHeading>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    <Field label="Reference">
                                        <input className={inputCls} value={content.cover.reference} onChange={(e) => updateCover({ reference: e.target.value })} placeholder="Works ref" />
                                    </Field>
                                    <Field label="Revision">
                                        <input className={inputCls} value={content.cover.revision} onChange={(e) => updateCover({ revision: e.target.value })} placeholder="Rev A" />
                                    </Field>
                                    <Field label="Date">
                                        <input className={inputCls} value={content.cover.date} onChange={(e) => updateCover({ date: e.target.value })} placeholder="06/08/25" />
                                    </Field>
                                    <Field label="Drawn by">
                                        <input className={inputCls} value={content.cover.drawnBy} onChange={(e) => updateCover({ drawnBy: e.target.value })} placeholder="Davey" />
                                    </Field>
                                    <Field label="Checked by">
                                        <input className={inputCls} value={content.cover.checkedBy} onChange={(e) => updateCover({ checkedBy: e.target.value })} placeholder="Chris" />
                                    </Field>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Sections */}
                {content.sections.map((section, si) => (
                    <SectionCard
                        key={section.id}
                        section={section}
                        index={si}
                        total={content.sections.length}
                        expanded={expandedSign === section.id}
                        onToggleExpand={() => toggleSign(section.id)}
                        expandedBlocks={expandedBlocks}
                        onToggleBlock={toggleBlock}
                        onUpdate={(patch) => updateSection(si, patch)}
                        onRemove={() => removeSection(si)}
                        onDuplicate={() => duplicateSection(si)}
                        onMove={(dir) => moveSection(si, dir)}
                        onAddBlock={(type) => addBlock(si, type)}
                        onReplaceBlock={(bi, b) => replaceBlock(si, bi, b)}
                        onRemoveBlock={(bi) => removeBlock(si, bi)}
                        onMoveBlock={(bi, dir) => moveBlock(si, bi, dir)}
                        onToggleLink={(blockId) => toggleLink(si, blockId)}
                        uploadImage={uploadImage}
                    />
                ))}

                <button
                    onClick={addSection}
                    className="w-full py-4 border-2 border-dashed border-neutral-300 rounded-[var(--radius-md)] text-sm font-medium text-neutral-500 hover:border-[#4e7e8c] hover:text-[#4e7e8c] transition-colors inline-flex items-center justify-center gap-2"
                >
                    <Plus size={16} /> Add sign (new page)
                </button>
            </div>
        </div>
    );
}

function SaveStatePill({ state }: { state: 'saved' | 'unsaved' | 'saving' }) {
    const map = {
        saved: 'bg-[#e8f0f3] text-[#3a5f6a]',
        unsaved: 'bg-amber-50 text-amber-700',
        saving: 'bg-neutral-100 text-neutral-500',
    } as const;
    const label = { saved: 'Saved', unsaved: 'Unsaved', saving: 'Saving…' }[state];
    return (
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${map[state]}`}>
            {label}
        </span>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <span className={labelCls}>{label}</span>
            {children}
        </div>
    );
}

function GroupHeading({ children }: { children: ReactNode }) {
    return (
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#4e7e8c] mb-3">{children}</div>
    );
}

function StyleBar({ value, onChange }: { value: PackStyle; onChange: (s: PackStyle) => void }) {
    return (
        <div className="bg-white border border-neutral-200 rounded-[var(--radius-md)] px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#4e7e8c] mb-2">Pack style</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(PACK_STYLES) as PackStyle[]).map((s) => {
                    const meta = PACK_STYLES[s];
                    const active = value === s;
                    return (
                        <button
                            key={s}
                            onClick={() => onChange(s)}
                            className={`flex items-center gap-2.5 text-left p-2 rounded-[var(--radius-sm)] border transition-colors ${
                                active
                                    ? 'border-[#4e7e8c] bg-[#e8f0f3]/50 ring-1 ring-[#4e7e8c]'
                                    : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                        >
                            <StyleThumb style={s} />
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-neutral-800">{meta.label}</span>
                                <span className="block text-[11px] text-neutral-500 truncate">{meta.blurb}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function StyleThumb({ style }: { style: PackStyle }) {
    const landscape = PACK_STYLES[style].orientation === 'landscape';
    const dark = style === 'editorial';
    const accent = style === 'mono' ? '#1a1a1a' : style === 'editorial' ? '#3a5f6a' : '#4e7e8c';
    return (
        <span
            className="shrink-0 rounded-[2px] border border-neutral-300 overflow-hidden flex flex-col"
            style={{ width: landscape ? 34 : 24, height: landscape ? 24 : 34, background: dark ? '#1a1f23' : '#fff' }}
        >
            <span className="flex-1" />
            <span style={{ height: 6, background: accent }} />
        </span>
    );
}

function CoverLogo({
    url,
    onChange,
    uploadImage,
}: {
    url: string;
    onChange: (url: string) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    const [uploading, setUploading] = useState(false);
    const ref = useRef<HTMLInputElement>(null);
    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        const u = await uploadImage(file);
        setUploading(false);
        if (u) onChange(u);
    }
    return (
        <div className="flex items-center gap-2">
            <input ref={ref} type="file" accept="image/*,.svg" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <div className="w-16 h-10 border border-neutral-200 rounded-[var(--radius-sm)] bg-neutral-50 flex items-center justify-center overflow-hidden shrink-0">
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="logo" className="max-w-full max-h-full object-contain" />
                ) : (
                    <ImageIcon size={16} className="text-neutral-300" />
                )}
            </div>
            <button onClick={() => ref.current?.click()} disabled={uploading} className="btn-secondary text-xs inline-flex items-center gap-1">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {url ? 'Replace' : 'Upload'}
            </button>
            {url && (
                <button onClick={() => onChange('')} className="text-xs text-neutral-400 hover:text-red-600">Remove</button>
            )}
        </div>
    );
}

// =============================================================================
// SECTION
// =============================================================================

function SectionCard({
    section,
    index,
    total,
    expanded,
    onToggleExpand,
    expandedBlocks,
    onToggleBlock,
    onUpdate,
    onRemove,
    onDuplicate,
    onMove,
    onAddBlock,
    onReplaceBlock,
    onRemoveBlock,
    onMoveBlock,
    onToggleLink,
    uploadImage,
}: {
    section: SignSection;
    index: number;
    total: number;
    expanded: boolean;
    onToggleExpand: () => void;
    expandedBlocks: Set<string>;
    onToggleBlock: (id: string) => void;
    onUpdate: (patch: Partial<SignSection>) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onMove: (dir: -1 | 1) => void;
    onAddBlock: (type: BlockType) => void;
    onReplaceBlock: (bi: number, b: Block) => void;
    onRemoveBlock: (bi: number) => void;
    onMoveBlock: (bi: number, dir: -1 | 1) => void;
    onToggleLink: (blockId: string) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    return (
        <section className="bg-white border border-neutral-200 rounded-[var(--radius-md)] overflow-hidden">
            <header className="flex items-center gap-2 px-3 py-2.5 bg-neutral-50 border-b border-neutral-200">
                <button onClick={onToggleExpand} className="p-1 text-neutral-500 hover:text-black rounded-[var(--radius-sm)]" title={expanded ? 'Collapse' : 'Expand'}>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider text-white bg-[#4e7e8c] px-2 py-1 rounded-[var(--radius-sm)] whitespace-nowrap">
                    Page {index + 1}
                </span>
                <input
                    value={section.signRef}
                    onChange={(e) => onUpdate({ signRef: e.target.value })}
                    className="w-24 px-2 py-1 text-xs font-semibold uppercase tracking-wide border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    placeholder="Ref 1"
                />
                <input
                    value={section.title}
                    onChange={(e) => onUpdate({ title: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold border border-transparent hover:border-neutral-200 focus:border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    placeholder="Sign name (e.g. Fascia)"
                />
                <IconBtn title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={15} /></IconBtn>
                <IconBtn title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ChevronDown size={15} /></IconBtn>
                <IconBtn title="Duplicate sign" onClick={onDuplicate}><Copy size={14} /></IconBtn>
                <IconBtn title="Delete sign" danger onClick={() => { if (confirm('Delete this sign / page?')) onRemove(); }}><Trash2 size={14} /></IconBtn>
            </header>

            {expanded ? (
                <div className="p-4 space-y-2.5">
                    {section.blocks.length === 0 && (
                        <p className="text-sm text-neutral-400 text-center py-6">No blocks yet — add one below.</p>
                    )}
                    {section.blocks.map((block, bi) => {
                        const blocks = section.blocks;
                        const prevLinked = bi > 0 && section.keepWith.includes(blocks[bi - 1].id);
                        const nextLinked = bi < blocks.length - 1 && section.keepWith.includes(block.id);
                        const canLink =
                            bi < blocks.length - 1 &&
                            block.type !== 'pageBreak' &&
                            blocks[bi + 1].type !== 'pageBreak';
                        return (
                            <div key={block.id}>
                                <BlockCard
                                    block={block}
                                    index={bi}
                                    total={blocks.length}
                                    grouped={prevLinked || nextLinked}
                                    expanded={expandedBlocks.has(block.id)}
                                    onToggle={() => onToggleBlock(block.id)}
                                    onChange={(b) => onReplaceBlock(bi, b)}
                                    onRemove={() => onRemoveBlock(bi)}
                                    onMove={(dir) => onMoveBlock(bi, dir)}
                                    uploadImage={uploadImage}
                                />
                                {canLink && (
                                    <LinkConnector
                                        linked={section.keepWith.includes(block.id)}
                                        onToggle={() => onToggleLink(block.id)}
                                    />
                                )}
                            </div>
                        );
                    })}
                    <BlockPalette onAdd={onAddBlock} />
                </div>
            ) : (
                <button onClick={onToggleExpand} className="w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-1.5">
                    {section.blocks.length === 0 ? (
                        <span className="text-xs text-neutral-400">empty — click to add blocks</span>
                    ) : (
                        section.blocks.map((b) => <SummaryChip key={b.id} block={b} />)
                    )}
                </button>
            )}
        </section>
    );
}

function SummaryChip({ block }: { block: Block }) {
    if (block.type === 'pageBreak') {
        return <span className="text-[10px] uppercase tracking-wide text-[#4e7e8c] px-1">— page break —</span>;
    }
    const Icon = BLOCK_ICONS[block.type];
    return (
        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-600 bg-neutral-100 rounded-full px-2 py-0.5">
            <span className="text-[#4e7e8c]"><Icon size={12} /></span>
            {BLOCK_META[block.type].label}
        </span>
    );
}

function BlockPalette({ onAdd }: { onAdd: (type: BlockType) => void }) {
    const [open, setOpen] = useState(false);
    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full py-2.5 border border-dashed border-neutral-300 rounded-[var(--radius-sm)] text-sm text-neutral-500 hover:border-[#4e7e8c] hover:text-[#4e7e8c] transition-colors inline-flex items-center justify-center gap-1.5"
            >
                <Plus size={15} /> Add block
            </button>
        );
    }
    return (
        <div className="border border-neutral-200 rounded-[var(--radius-md)] p-3 bg-neutral-50/60">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Add a block</span>
                <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-black"><X size={14} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PALETTE_BLOCKS.map((t) => {
                    const Icon = BLOCK_ICONS[t];
                    return (
                        <button
                            key={t}
                            onClick={() => { onAdd(t); setOpen(false); }}
                            className="flex items-start gap-2.5 text-left p-2.5 bg-white border border-neutral-200 rounded-[var(--radius-sm)] hover:border-[#4e7e8c] hover:bg-[#e8f0f3]/40 transition-colors"
                        >
                            <span className="mt-0.5 text-[#4e7e8c]"><Icon size={17} /></span>
                            <span>
                                <span className="block text-sm font-semibold text-neutral-800">{BLOCK_META[t].label}</span>
                                <span className="block text-xs text-neutral-500 leading-snug">{BLOCK_META[t].description}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function LinkConnector({ linked, onToggle }: { linked: boolean; onToggle: () => void }) {
    return (
        <div className="flex justify-center mt-1.5">
            <button
                type="button"
                onClick={onToggle}
                title={linked ? 'Linked — kept on the same page. Click to unlink.' : 'Link — keep these on the same page'}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border transition-colors ${
                    linked
                        ? 'border-[#4e7e8c] bg-[#e8f0f3] text-[#3a5f6a]'
                        : 'border-neutral-200 text-neutral-300 hover:text-[#4e7e8c] hover:border-[#4e7e8c]'
                }`}
            >
                <Link2 size={11} /> {linked ? 'kept together' : 'link'}
            </button>
        </div>
    );
}

function IconBtn({
    children,
    title,
    onClick,
    disabled,
    danger,
    onDark,
}: {
    children: ReactNode;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    onDark?: boolean;
}) {
    const cls = onDark
        ? 'text-white/75 hover:text-white hover:bg-white/20'
        : danger
            ? 'text-neutral-400 hover:text-red-600 hover:bg-red-50'
            : 'text-neutral-400 hover:text-black hover:bg-neutral-100';
    return (
        <button
            title={title}
            onClick={onClick}
            disabled={disabled}
            className={`p-1.5 rounded-[var(--radius-sm)] transition-colors disabled:opacity-30 ${cls}`}
        >
            {children}
        </button>
    );
}

// =============================================================================
// BLOCK
// =============================================================================

function BlockCard({
    block,
    index,
    total,
    grouped,
    expanded,
    onToggle,
    onChange,
    onRemove,
    onMove,
    uploadImage,
}: {
    block: Block;
    index: number;
    total: number;
    grouped?: boolean;
    expanded: boolean;
    onToggle: () => void;
    onChange: (b: Block) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    const Icon = BLOCK_ICONS[block.type];

    // Page break carries no content — render it as a slim divider with controls.
    if (block.type === 'pageBreak') {
        return (
            <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-[#4e7e8c]/50 rounded-[var(--radius-sm)] bg-[#e8f0f3]/30">
                <span className="text-[#4e7e8c]"><Icon size={14} /></span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4e7e8c] flex-1">Page break — new page below</span>
                <IconBtn title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={14} /></IconBtn>
                <IconBtn title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ChevronDown size={14} /></IconBtn>
                <IconBtn title="Remove block" danger onClick={onRemove}><X size={14} /></IconBtn>
            </div>
        );
    }

    // Collapsed: a one-line summary row.
    if (!expanded) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] bg-white hover:border-[#4e7e8c]/60 transition-colors ${grouped ? 'border-l-2 border-l-[#4e7e8c]' : ''}`}>
                <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <span className="text-[#4e7e8c] shrink-0"><Icon size={15} /></span>
                    <span className="text-xs font-semibold text-neutral-700 shrink-0">{BLOCK_META[block.type].label}</span>
                    <span className="text-xs text-neutral-400 truncate">{blockSummary(block)}</span>
                </button>
                <IconBtn title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={14} /></IconBtn>
                <IconBtn title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ChevronDown size={14} /></IconBtn>
                <IconBtn title="Remove block" danger onClick={onRemove}><X size={14} /></IconBtn>
                <button onClick={onToggle} className="p-1 text-neutral-400 hover:text-black" title="Edit"><ChevronRight size={15} /></button>
            </div>
        );
    }

    // Expanded: teal header + editor.
    return (
        <div className="border border-[#4e7e8c] rounded-[var(--radius-sm)] bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#4e7e8c] text-white">
                <button onClick={onToggle} className="text-white/80 hover:text-white" title="Collapse"><ChevronDown size={14} /></button>
                <span className="text-white"><Icon size={14} /></span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white flex-1">
                    {BLOCK_META[block.type].label}
                </span>
                <IconBtn title="Move up" disabled={index === 0} onDark onClick={() => onMove(-1)}><ChevronUp size={14} /></IconBtn>
                <IconBtn title="Move down" disabled={index === total - 1} onDark onClick={() => onMove(1)}><ChevronDown size={14} /></IconBtn>
                <IconBtn title="Remove block" onDark onClick={onRemove}><X size={14} /></IconBtn>
            </div>
            <div className="p-3">
                <BlockBody block={block} onChange={onChange} uploadImage={uploadImage} />
            </div>
        </div>
    );
}

function MaterialButton({ onPick, label = 'Material' }: { onPick: (text: string) => void; label?: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="text-xs font-medium text-[#4e7e8c] hover:underline inline-flex items-center gap-1"
            >
                <Palette size={13} /> {label}
            </button>
            {open && (
                <MaterialPicker
                    onPick={(t) => { onPick(t); setOpen(false); }}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

function MaterialPicker({ onPick, onClose }: { onPick: (text: string) => void; onClose: () => void }) {
    const [q, setQ] = useState('');
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        const list = s
            ? MATERIAL_ITEMS.filter((m) => m.label.toLowerCase().includes(s) || m.sub.toLowerCase().includes(s))
            : MATERIAL_ITEMS;
        return list.slice(0, 80);
    }, [q]);
    return (
        <div className="absolute z-30 mt-1 left-0 w-72 bg-white border border-neutral-200 rounded-[var(--radius-md)] shadow-lg p-2">
            <div className="flex items-center gap-1.5 mb-2 border-b border-neutral-100 pb-2">
                <Search size={14} className="text-neutral-400 shrink-0" />
                <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Acrylic code, colour or RAL…"
                    className="flex-1 min-w-0 text-sm outline-none"
                />
                <button onClick={onClose} className="text-neutral-400 hover:text-black shrink-0"><X size={14} /></button>
            </div>
            <div className="max-h-64 overflow-y-auto">
                {filtered.map((m, i) => (
                    <button
                        key={i}
                        onClick={() => onPick(m.text)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[#e8f0f3]/60 text-left"
                    >
                        <span className="h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: m.hex }} />
                        <span className="min-w-0">
                            <span className="block text-xs font-semibold text-neutral-800 truncate">{m.label}</span>
                            <span className="block text-[11px] text-neutral-500 truncate">{m.sub}</span>
                        </span>
                    </button>
                ))}
                {filtered.length === 0 && (
                    <p className="text-xs text-neutral-400 px-2 py-3 text-center">No match</p>
                )}
            </div>
        </div>
    );
}

function BlockBody({
    block,
    onChange,
    uploadImage,
}: {
    block: Block;
    onChange: (b: Block) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    switch (block.type) {
        case 'heading':
            return (
                <input
                    className="w-full px-2 py-1.5 text-lg font-bold border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    value={block.text}
                    onChange={(e) => onChange({ ...block, text: e.target.value })}
                    placeholder="Heading"
                />
            );

        case 'text':
            return (
                <div className="space-y-2">
                    <input
                        className={inputCls}
                        value={block.title}
                        onChange={(e) => onChange({ ...block, title: e.target.value })}
                        placeholder="Title (optional, e.g. Construction specification)"
                    />
                    <textarea
                        className={`${inputCls} min-h-[120px] leading-relaxed`}
                        value={block.body}
                        onChange={(e) => onChange({ ...block, body: e.target.value })}
                        placeholder="Construction notes / specification…"
                    />
                </div>
            );

        case 'image':
        case 'visual':
            return <MediaBody block={block} onChange={onChange} uploadImage={uploadImage} />;

        case 'technical':
            return <TechnicalBody block={block} onChange={onChange} uploadImage={uploadImage} />;

        case 'specTable':
            return (
                <div className="space-y-2">
                    <input className={inputCls} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Table title" />
                    {block.rows.map((row, ri) => (
                        <div key={ri} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 items-center">
                            <input className={inputCls} value={row.label} onChange={(e) => { const rows = block.rows.slice(); rows[ri] = { ...row, label: e.target.value }; onChange({ ...block, rows }); }} placeholder="Label" />
                            <input className={inputCls} value={row.value} onChange={(e) => { const rows = block.rows.slice(); rows[ri] = { ...row, value: e.target.value }; onChange({ ...block, rows }); }} placeholder="Value" />
                            <IconBtn title="Remove row" danger onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== ri) })}><X size={14} /></IconBtn>
                        </div>
                    ))}
                    <div className="flex items-center gap-4">
                        <AddRowBtn onClick={() => onChange({ ...block, rows: [...block.rows, { label: '', value: '' }] })} label="Add row" />
                        <MaterialButton label="Material from library" onPick={(t) => onChange({ ...block, rows: [...block.rows, { label: 'Material', value: t }] })} />
                    </div>
                </div>
            );

        case 'callouts':
            return (
                <div className="space-y-2">
                    <input className={inputCls} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Callouts title" />
                    {block.items.map((item, ii) => (
                        <div key={ii} className="flex gap-2 items-center">
                            <span className="w-1.5 h-1.5 bg-[#4e7e8c] rounded-[1px] shrink-0" />
                            <input className={`${inputCls} flex-1`} value={item} onChange={(e) => { const items = block.items.slice(); items[ii] = e.target.value; onChange({ ...block, items }); }} placeholder="e.g. 5mm opal acrylic faces" />
                            <IconBtn title="Remove" danger onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== ii) })}><X size={14} /></IconBtn>
                        </div>
                    ))}
                    <div className="flex items-center gap-4">
                        <AddRowBtn onClick={() => onChange({ ...block, items: [...block.items, ''] })} label="Add callout" />
                        <MaterialButton onPick={(t) => onChange({ ...block, items: [...block.items, t] })} />
                    </div>
                </div>
            );

        case 'stages':
            return (
                <div className="space-y-2">
                    <input className={inputCls} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Stages title" />
                    {block.stages.map((stage, si) => (
                        <div key={si} className="flex gap-2 items-start">
                            <input type="checkbox" checked={stage.done} onChange={(e) => { const stages = block.stages.slice(); stages[si] = { ...stage, done: e.target.checked }; onChange({ ...block, stages }); }} className="mt-2.5" title="Mark stage complete" />
                            <input className={`${inputCls} w-1/3`} value={stage.name} onChange={(e) => { const stages = block.stages.slice(); stages[si] = { ...stage, name: e.target.value }; onChange({ ...block, stages }); }} placeholder="Stage" />
                            <input className={`${inputCls} flex-1`} value={stage.instructions} onChange={(e) => { const stages = block.stages.slice(); stages[si] = { ...stage, instructions: e.target.value }; onChange({ ...block, stages }); }} placeholder="Instructions for this stage" />
                            <IconBtn title="Remove stage" danger onClick={() => onChange({ ...block, stages: block.stages.filter((_, i) => i !== si) })}><X size={14} /></IconBtn>
                        </div>
                    ))}
                    <AddRowBtn onClick={() => onChange({ ...block, stages: [...block.stages, { name: '', instructions: '', done: false }] })} label="Add stage" />
                </div>
            );

        case 'qc':
            return (
                <div className="space-y-2">
                    <input className={inputCls} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="QC title" />
                    {block.checks.map((check, ci) => (
                        <div key={ci} className="flex gap-2">
                            <input className={`${inputCls} flex-1`} value={check.label} onChange={(e) => { const checks = block.checks.slice(); checks[ci] = { ...check, label: e.target.value }; onChange({ ...block, checks }); }} placeholder="e.g. Office check" />
                            <IconBtn title="Remove" danger onClick={() => onChange({ ...block, checks: block.checks.filter((_, i) => i !== ci) })}><X size={14} /></IconBtn>
                        </div>
                    ))}
                    <AddRowBtn onClick={() => onChange({ ...block, checks: [...block.checks, { label: '', done: false }] })} label="Add check" />
                </div>
            );

        case 'pageBreak':
            return (
                <div className="flex items-center gap-3 py-1 text-[#4e7e8c]">
                    <span className="flex-1 border-t border-dashed border-[#4e7e8c]/50" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap">New page starts below</span>
                    <span className="flex-1 border-t border-dashed border-[#4e7e8c]/50" />
                </div>
            );
    }
}

function PdfPager({ page, numPages, busy, onChange }: { page: number; numPages: number; busy: boolean; onChange: (p: number) => void }) {
    if (numPages <= 1) return null;
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">PDF page</span>
            <button type="button" disabled={busy || page <= 1} onClick={() => onChange(page - 1)} className="p-1 rounded-[var(--radius-sm)] hover:bg-neutral-100 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className="text-xs tabular-nums w-12 text-center">{page} / {numPages}</span>
            <button type="button" disabled={busy || page >= numPages} onClick={() => onChange(page + 1)} className="p-1 rounded-[var(--radius-sm)] hover:bg-neutral-100 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
    );
}

function AddRowBtn({ onClick, label }: { onClick: () => void; label: string }) {
    return (
        <button onClick={onClick} className="text-xs font-medium text-[#4e7e8c] hover:underline inline-flex items-center gap-1">
            <Plus size={13} /> {label}
        </button>
    );
}

// ---- visual / legacy image ----
function MediaBody({
    block,
    onChange,
    uploadImage,
}: {
    block: Extract<Block, { type: 'image' | 'visual' }>;
    onChange: (b: Block) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    const [uploading, setUploading] = useState(false);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [numPages, setNumPages] = useState(1);
    const [page, setPage] = useState(1);
    const fileRef = useRef<HTMLInputElement>(null);

    async function applyPdfPage(file: File, p: number) {
        const res = await pdfPageToFile(file, p);
        if (!res) return;
        const url = await uploadImage(res.file);
        if (url) onChange({ ...block, url });
    }

    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        try {
            if (isPdf(file)) {
                const n = await pdfPageCount(file);
                setPdfFile(file); setNumPages(n); setPage(1);
                await applyPdfPage(file, 1);
            } else {
                setPdfFile(null); setNumPages(1); setPage(1);
                const url = await uploadImage(file);
                if (url) onChange({ ...block, url });
            }
        } finally {
            setUploading(false);
        }
    }

    async function changePage(p: number) {
        if (!pdfFile) return;
        setUploading(true); setPage(p);
        try { await applyPdfPage(pdfFile, p); } finally { setUploading(false); }
    }

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-3">
                <div className="w-40 shrink-0 border border-neutral-200 rounded-[var(--radius-sm)] bg-neutral-50 flex items-center justify-center overflow-hidden" style={{ height: 110 }}>
                    {block.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={block.url} alt={block.caption || 'preview'} className="w-full h-full" style={{ objectFit: block.fit }} />
                    ) : (
                        <span className="text-xs text-neutral-400">No image</span>
                    )}
                </div>
                <div className="flex-1 space-y-2">
                    <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary inline-flex items-center gap-1.5">
                        {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                        {uploading ? 'uploading…' : block.url ? 'Replace render / photo' : 'Upload render / photo / PDF'}
                    </button>
                    <PdfPager page={page} numPages={numPages} busy={uploading} onChange={changePage} />
                    <input className={inputCls} value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" />
                </div>
            </div>
            <div className="flex items-center gap-4">
                <label className="text-xs text-neutral-500 inline-flex items-center gap-1.5">
                    Fit
                    <select className="px-2 py-1 text-xs border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]" value={block.fit} onChange={(e) => onChange({ ...block, fit: e.target.value as 'contain' | 'cover' })}>
                        <option value="contain">contain</option>
                        <option value="cover">cover</option>
                    </select>
                </label>
                <label className="text-xs text-neutral-500 inline-flex items-center gap-2 flex-1">
                    Height
                    <input type="range" min={120} max={700} step={10} value={block.height} onChange={(e) => onChange({ ...block, height: Number(e.target.value) })} className="flex-1" />
                    <span className="tabular-nums w-10 text-right">{block.height}px</span>
                </label>
            </div>
        </div>
    );
}

// ---- technical drawing (dimensioned, SVG-aware) ----
function TechnicalBody({
    block,
    onChange,
    uploadImage,
}: {
    block: Extract<Block, { type: 'technical' }>;
    onChange: (b: Block) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    const [uploading, setUploading] = useState(false);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [numPages, setNumPages] = useState(1);
    const [page, setPage] = useState(1);
    const fileRef = useRef<HTMLInputElement>(null);

    async function applyPdfPage(file: File, p: number) {
        const res = await pdfPageToFile(file, p);
        if (!res) return;
        const url = await uploadImage(res.file);
        if (url) onChange({ ...block, url, isSvg: false, aspect: res.aspect || block.aspect });
    }

    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        try {
            if (isPdf(file)) {
                const n = await pdfPageCount(file);
                setPdfFile(file); setNumPages(n); setPage(1);
                await applyPdfPage(file, 1);
            } else {
                setPdfFile(null); setNumPages(1); setPage(1);
                const [url, info] = await Promise.all([uploadImage(file), analyzeDrawing(file)]);
                if (!url) return;
                onChange({
                    ...block,
                    url,
                    isSvg: info.isSvg,
                    aspect: info.aspect || block.aspect,
                    widthMm: info.widthMm ?? block.widthMm,
                    heightMm: info.heightMm ?? block.heightMm,
                });
            }
        } finally {
            setUploading(false);
        }
    }

    async function changePage(p: number) {
        if (!pdfFile) return;
        setUploading(true); setPage(p);
        try { await applyPdfPage(pdfFile, p); } finally { setUploading(false); }
    }

    function setWidth(mm: number | null) {
        const heightMm = mm != null && block.aspect > 0 ? Math.round(mm / block.aspect) : block.heightMm;
        onChange({ ...block, widthMm: mm, heightMm });
    }

    const scaleNote = block.aspect > 0
        ? 'Aspect read from the drawing — set the overall width and the height follows.'
        : 'Enter the overall width and height (no scale could be read from the file).';

    return (
        <div className="space-y-3">
            <div className="flex items-start gap-3">
                <div className="w-44 shrink-0 border border-neutral-200 rounded-[var(--radius-sm)] bg-[repeating-linear-gradient(45deg,#fafafa,#fafafa_6px,#f3f3f3_6px,#f3f3f3_12px)] flex items-center justify-center overflow-hidden relative" style={{ height: 120 }}>
                    {block.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={block.url} alt={block.caption || 'drawing'} className="max-w-full max-h-full object-contain" />
                    ) : (
                        <span className="text-xs text-neutral-400 px-2 text-center">No drawing</span>
                    )}
                    {block.url && block.showDimensions && block.widthMm != null && (
                        <span className="absolute bottom-0 inset-x-0 text-center text-[9px] font-semibold text-[#4e7e8c] bg-white/80">
                            {block.widthMm} × {block.heightMm ?? '—'} mm
                        </span>
                    )}
                </div>
                <div className="flex-1 space-y-2">
                    <input ref={fileRef} type="file" accept="image/svg+xml,.svg,application/pdf,image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary inline-flex items-center gap-1.5">
                            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Ruler size={15} />}
                            {uploading ? 'reading…' : block.url ? 'Replace drawing' : 'Upload drawing (SVG, PDF or image)'}
                        </button>
                        {block.isSvg && <span className="text-[10px] font-bold uppercase tracking-wide text-[#4e7e8c] bg-[#e8f0f3] px-1.5 py-0.5 rounded">SVG · vector</span>}
                    </div>
                    <PdfPager page={page} numPages={numPages} busy={uploading} onChange={changePage} />
                    <p className="text-xs text-neutral-500 leading-snug">{scaleNote}</p>
                    <input className={inputCls} value={block.caption} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional, e.g. Section detail)" />
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                <div>
                    <span className={labelCls}>Overall width (mm)</span>
                    <input type="number" className={inputCls} value={block.widthMm ?? ''} onChange={(e) => setWidth(e.target.value === '' ? null : Number(e.target.value))} placeholder="e.g. 5110" />
                </div>
                <div>
                    <span className={labelCls}>Overall height (mm)</span>
                    <input type="number" className={inputCls} value={block.heightMm ?? ''} onChange={(e) => onChange({ ...block, heightMm: e.target.value === '' ? null : Number(e.target.value) })} placeholder="e.g. 1100" />
                </div>
                <label className="text-xs text-neutral-600 inline-flex items-center gap-2 pb-2">
                    <input type="checkbox" checked={block.showDimensions} onChange={(e) => onChange({ ...block, showDimensions: e.target.checked })} />
                    Dimension lines
                </label>
                <label className="text-xs text-neutral-500 inline-flex items-center gap-2">
                    Size
                    <input type="range" min={120} max={700} step={10} value={block.height} onChange={(e) => onChange({ ...block, height: Number(e.target.value) })} className="flex-1" />
                </label>
            </div>
        </div>
    );
}
