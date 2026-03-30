'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArtworkComponentWithVersions } from '@/lib/artwork/types';
import { submitDesign, signOffDesign, uploadArtworkThumbnail } from '@/lib/artwork/actions';
import { formatDimensionWithReturns, formatDateTime, getLightingTypeLabel } from '@/lib/artwork/utils';
import { Modal } from '@/app/(portal)/components/ui';
import { Loader2, Check, Lock, Upload } from 'lucide-react';

interface DesignSectionProps {
    component: ArtworkComponentWithVersions;
    jobId: string;
    thumbnailUrl?: string | null;
}

export function DesignSection({ component, jobId, thumbnailUrl }: DesignSectionProps) {
    const router = useRouter();
    const [editing, setEditing] = useState(!component.width_mm);
    const [submitting, setSubmitting] = useState(false);
    const [signingOff, setSigningOff] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSignOffModal, setShowSignOffModal] = useState(false);

    // Form state
    const [widthMm, setWidthMm] = useState(component.width_mm ? String(component.width_mm) : '');
    const [heightMm, setHeightMm] = useState(component.height_mm ? String(component.height_mm) : '');
    const [returnsMm, setReturnsMm] = useState(component.returns_mm ? String(component.returns_mm) : '');
    const [material, setMaterial] = useState(component.material || '');
    const [lighting, setLighting] = useState(component.lighting || '');
    const [scaleConfirmed, setScaleConfirmed] = useState(component.scale_confirmed);
    const [bleedIncluded, setBleedIncluded] = useState(component.bleed_included);
    const [filePath, setFilePath] = useState(component.file_path || '');
    const [notes, setNotes] = useState(component.notes || '');

    // Extra dimension items state (B, C, D...)
    const [extraItems, setExtraItems] = useState<Array<{
        width_mm: string;
        height_mm: string;
        returns_mm: string;
    }>>(
        component.extra_items?.map(item => ({
            width_mm: item.width_mm ? String(item.width_mm) : '',
            height_mm: item.height_mm ? String(item.height_mm) : '',
            returns_mm: item.returns_mm ? String(item.returns_mm) : '',
        })) || []
    );

    const addExtraItem = () => {
        setExtraItems([...extraItems, { width_mm: '', height_mm: '', returns_mm: '' }]);
    };

    const removeExtraItem = (index: number) => {
        setExtraItems(extraItems.filter((_, i) => i !== index));
    };

    const updateExtraItem = (index: number, field: string, value: string) => {
        const updated = [...extraItems];
        updated[index] = { ...updated[index], [field]: value };
        setExtraItems(updated);
    };

    const isSignedOff = !!component.design_signed_off_at;
    const isLocked = isSignedOff && !editing;

    const handleSubmitDesign = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const result = await submitDesign(component.id, {
                width_mm: parseFloat(widthMm),
                height_mm: parseFloat(heightMm),
                returns_mm: returnsMm ? parseFloat(returnsMm) : null,
                material,
                lighting: lighting || null,
                scale_confirmed: scaleConfirmed as true,
                bleed_included: bleedIncluded,
                file_path: filePath,
                notes: notes || undefined,
                extra_items: extraItems.length > 0
                    ? extraItems.map(item => ({
                        width_mm: parseFloat(item.width_mm),
                        height_mm: parseFloat(item.height_mm),
                        returns_mm: item.returns_mm ? parseFloat(item.returns_mm) : null,
                    }))
                    : undefined,
            });

            if ('error' in result) {
                setError(result.error);
                setSubmitting(false);
                return;
            }

            setEditing(false);
            setSubmitting(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to submit design');
            setSubmitting(false);
        }
    };

    const handleSignOff = async () => {
        setShowSignOffModal(false);
        setSigningOff(true);
        setError(null);

        try {
            const result = await signOffDesign(component.id);

            if ('error' in result) {
                setError(result.error);
                setSigningOff(false);
                return;
            }

            setSigningOff(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to sign off');
            setSigningOff(false);
        }
    };

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const result = await uploadArtworkThumbnail(component.id, formData);

            if ('error' in result) {
                setError(result.error);
            }

            setUploading(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to upload thumbnail');
            setUploading(false);
        }
    };

    // Read-only view when signed off and not editing
    if (isLocked) {
        return (
            <div className="space-y-4">
                {/* Signed off badge */}
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-[var(--radius-sm)]">
                    <Lock size={14} className="text-green-600" />
                    <span className="text-sm text-green-700 font-medium">
                        design signed off
                    </span>
                    {component.design_signed_off_at && (
                        <span className="text-xs text-green-600 ml-auto">
                            {formatDateTime(component.design_signed_off_at)}
                        </span>
                    )}
                </div>

                {/* Artwork Thumbnail */}
                {thumbnailUrl && (
                    <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden bg-neutral-50">
                        <img
                            src={thumbnailUrl}
                            alt={`Artwork for ${component.name}`}
                            className="max-h-48 w-auto mx-auto object-contain p-2"
                        />
                    </div>
                )}

                {/* Spec Summary */}
                <div className="space-y-2">
                    <SpecRow label={component.extra_items?.length ? 'item A' : 'dimensions'} value={formatDimensionWithReturns(
                        Number(component.width_mm),
                        Number(component.height_mm),
                        component.returns_mm ? Number(component.returns_mm) : null
                    )} />
                    {component.extra_items?.map((item) => (
                        <SpecRow
                            key={item.id}
                            label={`item ${item.label}`}
                            value={formatDimensionWithReturns(
                                Number(item.width_mm),
                                Number(item.height_mm),
                                item.returns_mm ? Number(item.returns_mm) : null
                            )}
                        />
                    ))}
                    <SpecRow label="material" value={component.material || '-'} />
                    {component.lighting && (
                        <SpecRow label="lighting" value={getLightingTypeLabel(component.lighting)} />
                    )}
                    <SpecRow label="scale 1:1" value={component.scale_confirmed ? 'confirmed' : 'not confirmed'} />
                    <SpecRow label="bleed" value={component.bleed_included ? 'included' : 'not included'} />
                    <SpecRow label="file path" value={component.file_path || '-'} mono />
                    {component.notes && <SpecRow label="notes" value={component.notes} />}
                </div>

                {/* Edit button */}
                <button
                    onClick={() => setEditing(true)}
                    className="btn-secondary text-sm"
                >
                    revise design
                </button>
            </div>
        );
    }

    // Editable form
    return (
        <>
            <form onSubmit={handleSubmitDesign} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Artwork Thumbnail Upload */}
                <div>
                    <label className="block text-sm font-medium text-neutral-900 mb-1">artwork thumbnail</label>
                    {thumbnailUrl ? (
                        <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden bg-neutral-50 mb-2">
                            <img
                                src={thumbnailUrl}
                                alt={`Artwork for ${component.name}`}
                                className="max-h-32 w-auto mx-auto object-contain p-2"
                            />
                        </div>
                    ) : null}
                    <label className="btn-secondary text-xs cursor-pointer inline-flex items-center gap-1">
                        <Upload size={14} />
                        {uploading ? 'uploading...' : component.artwork_thumbnail_url ? 'replace thumbnail' : 'upload thumbnail'}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleThumbnailUpload}
                            className="hidden"
                            disabled={uploading}
                        />
                    </label>
                </div>

                {/* Dimensions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                            width (mm) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={widthMm}
                            onChange={(e) => setWidthMm(e.target.value)}
                            placeholder="2990"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            required
                            disabled={submitting}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                            height (mm) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={heightMm}
                            onChange={(e) => setHeightMm(e.target.value)}
                            placeholder="1395"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            required
                            disabled={submitting}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                            returns (mm)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={returnsMm}
                            onChange={(e) => setReturnsMm(e.target.value)}
                            placeholder="80"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            disabled={submitting}
                        />
                    </div>
                </div>

                {/* Extra Dimension Items */}
                {extraItems.map((item, index) => (
                    <div key={index} className="border border-neutral-200 rounded-[var(--radius-sm)] p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                item {String.fromCharCode(66 + index)}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeExtraItem(index)}
                                className="text-xs text-red-500 hover:text-red-700"
                                disabled={submitting}
                            >
                                remove
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">
                                    width (mm) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={item.width_mm}
                                    onChange={(e) => updateExtraItem(index, 'width_mm', e.target.value)}
                                    placeholder="width"
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    required
                                    disabled={submitting}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">
                                    height (mm) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={item.height_mm}
                                    onChange={(e) => updateExtraItem(index, 'height_mm', e.target.value)}
                                    placeholder="height"
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    required
                                    disabled={submitting}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">
                                    returns (mm)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={item.returns_mm}
                                    onChange={(e) => updateExtraItem(index, 'returns_mm', e.target.value)}
                                    placeholder="returns"
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    disabled={submitting}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={addExtraItem}
                    disabled={submitting}
                    className="btn-secondary text-xs w-full"
                >
                    + add item {String.fromCharCode(66 + extraItems.length)}
                </button>

                {/* Material */}
                <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                        material <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={material}
                        onChange={(e) => setMaterial(e.target.value)}
                        placeholder="e.g. Dibond 3mm, Foamex 10mm, Opal Acrylic 5mm"
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        required
                        disabled={submitting}
                    />
                </div>

                {/* Lighting */}
                <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                        lighting
                    </label>
                    <select
                        value={lighting}
                        onChange={(e) => setLighting(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        disabled={submitting}
                    >
                        <option value="">none</option>
                        <option value="backlit">backlit</option>
                        <option value="halo">halo</option>
                        <option value="edge_lit">edge-lit</option>
                    </select>
                </div>

                {/* Confirmations */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={scaleConfirmed}
                            onChange={(e) => setScaleConfirmed(e.target.checked)}
                            className="rounded border-neutral-300"
                            disabled={submitting}
                        />
                        <span>scale is 1:1 — confirmed <span className="text-red-500">*</span></span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={bleedIncluded}
                            onChange={(e) => setBleedIncluded(e.target.checked)}
                            className="rounded border-neutral-300"
                            disabled={submitting}
                        />
                        <span>bleed included in artwork</span>
                    </label>
                </div>

                {/* File Path */}
                <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                        file path <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={filePath}
                        onChange={(e) => setFilePath(e.target.value)}
                        placeholder="\\server\jobs\AWC-001\artwork.ai"
                        className="w-full px-3 py-2 text-sm font-mono border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        required
                        disabled={submitting}
                    />
                </div>

                {/* Notes */}
                <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="any design notes for production..."
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black resize-none"
                        disabled={submitting}
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-neutral-200">
                    <button
                        type="submit"
                        disabled={submitting || !scaleConfirmed}
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        {submitting && <Loader2 size={16} className="animate-spin" />}
                        {submitting ? 'submitting...' : 'submit design'}
                    </button>

                    {component.status === 'design_submitted' && !isSignedOff && (
                        <button
                            type="button"
                            onClick={() => setShowSignOffModal(true)}
                            disabled={signingOff}
                            className="btn-secondary inline-flex items-center gap-2 border-green-200 text-green-700 hover:bg-green-50"
                        >
                            {signingOff ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Check size={16} />
                            )}
                            {signingOff ? 'signing off...' : 'sign off design'}
                        </button>
                    )}

                    {isSignedOff && (
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="btn-secondary"
                        >
                            cancel
                        </button>
                    )}
                </div>
            </form>

            {/* Design Sign-Off Confirmation Modal */}
            <Modal open={showSignOffModal} onClose={() => setShowSignOffModal(false)} title="sign off design">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-600">
                        are you sure you want to sign off this design? once signed off, production can proceed with these specifications.
                    </p>
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-[var(--radius-sm)] text-xs space-y-1">
                        <div className="flex justify-between">
                            <span className="text-neutral-500">{extraItems.length > 0 ? 'item A' : 'dimensions'}</span>
                            <span className="font-medium">{widthMm} × {heightMm}{returnsMm ? ` + ${returnsMm} returns` : ''} mm</span>
                        </div>
                        {extraItems.map((item, index) => (
                            <div key={index} className="flex justify-between">
                                <span className="text-neutral-500">item {String.fromCharCode(66 + index)}</span>
                                <span className="font-medium">{item.width_mm} × {item.height_mm}{item.returns_mm ? ` + ${item.returns_mm} returns` : ''} mm</span>
                            </div>
                        ))}
                        <div className="flex justify-between">
                            <span className="text-neutral-500">material</span>
                            <span className="font-medium">{material}</span>
                        </div>
                        {lighting && (
                            <div className="flex justify-between">
                                <span className="text-neutral-500">lighting</span>
                                <span className="font-medium">{getLightingTypeLabel(lighting)}</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleSignOff}
                            className="btn-primary inline-flex items-center gap-2 bg-green-600 hover:bg-green-700"
                        >
                            <Check size={16} />
                            confirm sign-off
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSignOffModal(false)}
                            className="btn-secondary"
                        >
                            cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function SpecRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex justify-between py-1.5 border-b border-neutral-100 last:border-0">
            <span className="text-xs text-neutral-500">{label}</span>
            <span className={`text-xs text-neutral-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    );
}
