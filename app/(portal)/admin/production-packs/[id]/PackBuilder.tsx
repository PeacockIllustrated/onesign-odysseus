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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    AlignLeft,
    ArrowLeft,
    BadgeCheck,
    ChevronDown,
    ChevronUp,
    Copy,
    Eye,
    Heading as HeadingIcon,
    Image as ImageIcon,
    ImagePlus,
    Info,
    List,
    ListChecks,
    Loader2,
    Plus,
    Ruler,
    Save,
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
    PALETTE_BLOCKS,
    genId,
    newBlock,
    newSection,
    type Block,
    type BlockType,
    type ProductionPackContent,
    type ProductionPackStatus,
    type SignSection,
} from '@/lib/production-packs/types';
import { PRODUCTION_PACKS_BUCKET } from '@/lib/production-packs/utils';

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
};

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

    const addSection = () => mutate((d) => d.sections.push(newSection(d.sections.length + 1)));
    const updateSection = (si: number, patch: Partial<SignSection>) =>
        mutate((d) => Object.assign(d.sections[si], patch));
    const removeSection = (si: number) => mutate((d) => d.sections.splice(si, 1));
    const duplicateSection = (si: number) =>
        mutate((d) => {
            const clone = structuredClone(d.sections[si]);
            clone.id = genId('sec');
            clone.blocks = clone.blocks.map((b) => ({ ...b, id: genId('b') }));
            clone.title = `${clone.title} (copy)`;
            d.sections.splice(si + 1, 0, clone);
        });
    const moveSection = (si: number, dir: -1 | 1) =>
        mutate((d) => {
            const ti = si + dir;
            if (ti < 0 || ti >= d.sections.length) return;
            [d.sections[si], d.sections[ti]] = [d.sections[ti], d.sections[si]];
        });

    const addBlock = (si: number, type: BlockType) =>
        mutate((d) => d.sections[si].blocks.push(newBlock(type)));
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
                            fill the cover, then add a <strong>sign</strong> for each item — every sign becomes
                            <strong> one A4 page</strong>. Drop in blocks (visual, technical drawing, spec, stages…),
                            then hit <strong>Preview / Print</strong>.
                        </div>
                        <button onClick={dismissHelp} className="text-neutral-400 hover:text-black" title="Dismiss">
                            <X size={15} />
                        </button>
                    </div>
                )}

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
                        onUpdate={(patch) => updateSection(si, patch)}
                        onRemove={() => removeSection(si)}
                        onDuplicate={() => duplicateSection(si)}
                        onMove={(dir) => moveSection(si, dir)}
                        onAddBlock={(type) => addBlock(si, type)}
                        onReplaceBlock={(bi, b) => replaceBlock(si, bi, b)}
                        onRemoveBlock={(bi) => removeBlock(si, bi)}
                        onMoveBlock={(bi, dir) => moveBlock(si, bi, dir)}
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
    onUpdate,
    onRemove,
    onDuplicate,
    onMove,
    onAddBlock,
    onReplaceBlock,
    onRemoveBlock,
    onMoveBlock,
    uploadImage,
}: {
    section: SignSection;
    index: number;
    total: number;
    onUpdate: (patch: Partial<SignSection>) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onMove: (dir: -1 | 1) => void;
    onAddBlock: (type: BlockType) => void;
    onReplaceBlock: (bi: number, b: Block) => void;
    onRemoveBlock: (bi: number) => void;
    onMoveBlock: (bi: number, dir: -1 | 1) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    return (
        <section className="bg-white border border-neutral-200 rounded-[var(--radius-md)] overflow-hidden">
            <header className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white bg-[#4e7e8c] px-2 py-1 rounded-[var(--radius-sm)] whitespace-nowrap">
                    Page {index + 1}
                </span>
                <input
                    value={section.signRef}
                    onChange={(e) => onUpdate({ signRef: e.target.value })}
                    className="w-28 px-2 py-1 text-xs font-semibold uppercase tracking-wide border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    placeholder="Sign Ref 1"
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

            <div className="p-4 space-y-3">
                {section.blocks.length === 0 && (
                    <p className="text-sm text-neutral-400 text-center py-6">No blocks yet — add one below.</p>
                )}
                {section.blocks.map((block, bi) => (
                    <BlockCard
                        key={block.id}
                        block={block}
                        index={bi}
                        total={section.blocks.length}
                        onChange={(b) => onReplaceBlock(bi, b)}
                        onRemove={() => onRemoveBlock(bi)}
                        onMove={(dir) => onMoveBlock(bi, dir)}
                        uploadImage={uploadImage}
                    />
                ))}
                <BlockPalette onAdd={onAddBlock} />
            </div>
        </section>
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

function IconBtn({
    children,
    title,
    onClick,
    disabled,
    danger,
}: {
    children: ReactNode;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}) {
    return (
        <button
            title={title}
            onClick={onClick}
            disabled={disabled}
            className={`p-1.5 rounded-[var(--radius-sm)] transition-colors disabled:opacity-30 ${
                danger ? 'text-neutral-400 hover:text-red-600 hover:bg-red-50' : 'text-neutral-400 hover:text-black hover:bg-neutral-100'
            }`}
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
    onChange,
    onRemove,
    onMove,
    uploadImage,
}: {
    block: Block;
    index: number;
    total: number;
    onChange: (b: Block) => void;
    onRemove: () => void;
    onMove: (dir: -1 | 1) => void;
    uploadImage: (file: File) => Promise<string | null>;
}) {
    const Icon = BLOCK_ICONS[block.type];
    return (
        <div className="border border-neutral-200 rounded-[var(--radius-sm)] bg-white">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-100 bg-neutral-50/60">
                <span className="text-[#4e7e8c]"><Icon size={14} /></span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 flex-1">
                    {BLOCK_META[block.type].label}
                </span>
                <IconBtn title="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ChevronUp size={14} /></IconBtn>
                <IconBtn title="Move down" disabled={index === total - 1} onClick={() => onMove(1)}><ChevronDown size={14} /></IconBtn>
                <IconBtn title="Remove block" danger onClick={onRemove}><X size={14} /></IconBtn>
            </div>
            <div className="p-3">
                <BlockBody block={block} onChange={onChange} uploadImage={uploadImage} />
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
                        <div key={ri} className="flex gap-2">
                            <input className={`${inputCls} w-2/5`} value={row.label} onChange={(e) => { const rows = block.rows.slice(); rows[ri] = { ...row, label: e.target.value }; onChange({ ...block, rows }); }} placeholder="Label" />
                            <input className={`${inputCls} flex-1`} value={row.value} onChange={(e) => { const rows = block.rows.slice(); rows[ri] = { ...row, value: e.target.value }; onChange({ ...block, rows }); }} placeholder="Value" />
                            <IconBtn title="Remove row" danger onClick={() => onChange({ ...block, rows: block.rows.filter((_, i) => i !== ri) })}><X size={14} /></IconBtn>
                        </div>
                    ))}
                    <AddRowBtn onClick={() => onChange({ ...block, rows: [...block.rows, { label: '', value: '' }] })} label="Add row" />
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
                    <AddRowBtn onClick={() => onChange({ ...block, items: [...block.items, ''] })} label="Add callout" />
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
    }
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
    const fileRef = useRef<HTMLInputElement>(null);
    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        const url = await uploadImage(file);
        setUploading(false);
        if (url) onChange({ ...block, url });
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
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary inline-flex items-center gap-1.5">
                        {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                        {uploading ? 'uploading…' : block.url ? 'Replace render / photo' : 'Upload render / photo'}
                    </button>
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
    const fileRef = useRef<HTMLInputElement>(null);

    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        const [url, info] = await Promise.all([uploadImage(file), analyzeDrawing(file)]);
        setUploading(false);
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
                    <input ref={fileRef} type="file" accept="image/svg+xml,.svg,image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                    <div className="flex items-center gap-2">
                        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary inline-flex items-center gap-1.5">
                            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Ruler size={15} />}
                            {uploading ? 'reading…' : block.url ? 'Replace drawing' : 'Upload drawing (SVG or image)'}
                        </button>
                        {block.isSvg && <span className="text-[10px] font-bold uppercase tracking-wide text-[#4e7e8c] bg-[#e8f0f3] px-1.5 py-0.5 rounded">SVG · vector</span>}
                    </div>
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
