'use client';

/**
 * Form for adding a generic (manual-priced) quote line item. Complements the
 * existing panel_letters_v1 form in QuoteLineItemForm. Captures a short label,
 * optional structured sub-items (which flow through to artwork skeleton
 * generation on quote acceptance), and manual pricing.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { addGenericQuoteItemAction } from '@/lib/quoter/actions';

interface SubItemRow {
    name: string;
    material: string;
    application_method: string;
    finish: string;
    quantity: string;
    width_mm: string;
    height_mm: string;
    returns_mm: string;
    notes: string;
}

const emptyRow = (): SubItemRow => ({
    name: '',
    material: '',
    application_method: '',
    finish: '',
    quantity: '1',
    width_mm: '',
    height_mm: '',
    returns_mm: '',
    notes: '',
});

const COMPONENT_TYPES = [
    { value: '', label: '— none —' },
    { value: 'panel', label: 'panel' },
    { value: 'vinyl', label: 'vinyl' },
    { value: 'acrylic', label: 'acrylic' },
    { value: 'push_through', label: 'push-through' },
    { value: 'dibond', label: 'dibond' },
    { value: 'aperture_cut', label: 'aperture cut panel' },
    { value: 'foamex', label: 'foamex' },
    { value: 'digital_print', label: 'digital print' },
    { value: 'flat_cut_letters', label: 'flat-cut letters' },
    { value: 'channel_letters', label: 'channel letters' },
    { value: 'engraved', label: 'engraved' },
    { value: 'led_module', label: 'LED module' },
    { value: 'other', label: 'other' },
];

const SERVICE_TYPES = [
    { value: '', label: '— select service —' },
    { value: 'Fitting', label: 'Fitting' },
    { value: 'Removal', label: 'Removal' },
    { value: 'Survey', label: 'Survey' },
];

interface Props {
    quoteId: string;
    onDone?: () => void;
}

export function GenericItemForm({ quoteId, onDone }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [isService, setIsService] = useState(false);
    const [serviceType, setServiceType] = useState('');
    const [partLabel, setPartLabel] = useState('');
    const [description, setDescription] = useState('');
    const [componentType, setComponentType] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [unitPrice, setUnitPrice] = useState('');
    const [discountPercent, setDiscountPercent] = useState('0');
    const [markupPercent, setMarkupPercent] = useState('0');
    const [lighting, setLighting] = useState('');
    const [specNotes, setSpecNotes] = useState('');
    const [subItems, setSubItems] = useState<SubItemRow[]>([]);

    const updateSubItem = (i: number, patch: Partial<SubItemRow>) => {
        setSubItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    };

    const submit = () => {
        setError(null);

        // Services use the selected service type as the part label if the user
        // hasn't filled one in themselves.
        const effectiveLabel = isService
            ? (partLabel.trim() || serviceType.trim())
            : partLabel.trim();

        if (isService && !serviceType) {
            setError('please pick a service type (fitting, removal, survey)');
            return;
        }
        if (!effectiveLabel) {
            setError('part label is required');
            return;
        }
        if (!unitPrice || Number(unitPrice) < 0) {
            setError('unit price must be 0 or more (£)');
            return;
        }

        const unitPricePence = Math.round(Number(unitPrice) * 100);

        const subItemsPayload = isService
            ? []
            : subItems
                  .filter((r) => r.name || r.material || r.width_mm || r.height_mm)
                  .map((r) => ({
                      name: r.name || undefined,
                      material: r.material || undefined,
                      application_method: r.application_method || undefined,
                      finish: r.finish || undefined,
                      quantity: r.quantity ? Number(r.quantity) : undefined,
                      width_mm: r.width_mm ? Number(r.width_mm) : undefined,
                      height_mm: r.height_mm ? Number(r.height_mm) : undefined,
                      returns_mm: r.returns_mm ? Number(r.returns_mm) : undefined,
                      notes: r.notes || undefined,
                  }));

        startTransition(async () => {
            const res = await addGenericQuoteItemAction(quoteId, {
                part_label: effectiveLabel,
                description: description.trim() || undefined,
                component_type: isService ? undefined : (componentType || undefined),
                is_production_work: !isService,
                quantity: Number(quantity) || 1,
                unit_price_pence: unitPricePence,
                discount_percent: Number(discountPercent) || 0,
                markup_percent: Number(markupPercent) || 0,
                lighting: isService ? undefined : (lighting || undefined),
                spec_notes: specNotes || undefined,
                sub_items: subItemsPayload,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            // Reset
            setIsService(false);
            setServiceType('');
            setPartLabel('');
            setDescription('');
            setComponentType('');
            setQuantity('1');
            setUnitPrice('');
            setDiscountPercent('0');
            setMarkupPercent('0');
            setLighting('');
            setSpecNotes('');
            setSubItems([]);
            onDone?.();
            router.refresh();
        });
    };

    const inputCls =
        'w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';
    const labelCls = 'block text-xs font-medium text-neutral-900 mb-1';

    return (
        <div className="space-y-4">
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Service toggle — top-of-form so staff can pick the line shape first. */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded space-y-3">
                <label className="flex items-start gap-2 text-sm text-neutral-800">
                    <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={isService}
                        onChange={(e) => {
                            setIsService(e.target.checked);
                            if (!e.target.checked) setServiceType('');
                        }}
                    />
                    <span>
                        <span className="font-medium">this line is a service</span>
                        <span className="text-neutral-500"> — fitting, removal, or survey (no artwork, no production work)</span>
                    </span>
                </label>

                {isService && (
                    <div>
                        <label className={labelCls}>service type *</label>
                        <select
                            className={inputCls}
                            value={serviceType}
                            onChange={(e) => setServiceType(e.target.value)}
                        >
                            {SERVICE_TYPES.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                    <label className={labelCls}>
                        part label {isService ? '(optional — defaults to service type)' : '*'}
                    </label>
                    <input
                        className={inputCls}
                        value={partLabel}
                        onChange={(e) => setPartLabel(e.target.value)}
                        placeholder={
                            isService
                                ? 'leave blank to use the service type above'
                                : 'e.g. "Main fascia panel", "Frosted window vinyl"'
                        }
                    />
                </div>
                <div className="sm:col-span-2">
                    <label className={labelCls}>description</label>
                    <textarea
                        className={inputCls}
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="free-form description, size, colour, material notes…"
                    />
                </div>
                {!isService && (
                    <>
                        <div>
                            <label className={labelCls}>component type</label>
                            <select
                                className={inputCls}
                                value={componentType}
                                onChange={(e) => setComponentType(e.target.value)}
                            >
                                {COMPONENT_TYPES.map((ct) => (
                                    <option key={ct.value} value={ct.value}>
                                        {ct.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>lighting (optional)</label>
                            <input
                                className={inputCls}
                                value={lighting}
                                onChange={(e) => setLighting(e.target.value)}
                                placeholder="e.g. internal led, halo, backlit"
                            />
                        </div>
                    </>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                    <label className={labelCls}>quantity</label>
                    <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                    />
                </div>
                <div>
                    <label className={labelCls}>unit price (£) *</label>
                    <input
                        type="number"
                        min={0}
                        step={0.01}
                        className={inputCls}
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                    />
                </div>
                <div>
                    <label className={labelCls}>discount %</label>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        className={inputCls}
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                    />
                </div>
                <div>
                    <label className={labelCls}>markup %</label>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        className={inputCls}
                        value={markupPercent}
                        onChange={(e) => setMarkupPercent(e.target.value)}
                    />
                </div>
            </div>

            {/* Sub-items editor — only relevant for production work */}
            {!isService && (
                <div className="pt-4 border-t border-neutral-200">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h3 className="text-sm font-semibold text-neutral-900">sub-items</h3>
                            <p className="text-xs text-neutral-500">
                                one row per distinct material/method — pre-populates the artwork skeleton on acceptance
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSubItems((prev) => [...prev, emptyRow()])}
                            className="btn-secondary text-xs inline-flex items-center gap-1"
                        >
                            <Plus size={12} /> add sub-item
                        </button>
                    </div>
                    {subItems.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic">
                            no sub-items yet — the artwork skeleton will contain an empty placeholder that the designer fills in
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {subItems.map((r, i) => (
                                <div
                                    key={i}
                                    className="border border-neutral-200 rounded p-3 bg-neutral-50 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-mono font-bold text-neutral-600">
                                            {String.fromCharCode(65 + i)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSubItems((prev) => prev.filter((_, idx) => idx !== i))
                                            }
                                            className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                                        >
                                            <Trash2 size={10} /> remove
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input
                                            className={inputCls}
                                            value={r.name}
                                            placeholder="name (e.g. 'QUEEN BEE letters')"
                                            onChange={(e) => updateSubItem(i, { name: e.target.value })}
                                        />
                                        <input
                                            className={inputCls}
                                            value={r.material}
                                            placeholder="material"
                                            onChange={(e) => updateSubItem(i, { material: e.target.value })}
                                        />
                                        <input
                                            className={inputCls}
                                            value={r.application_method}
                                            placeholder="method (stuck to face, weeded...)"
                                            onChange={(e) =>
                                                updateSubItem(i, { application_method: e.target.value })
                                            }
                                        />
                                        <input
                                            className={inputCls}
                                            value={r.finish}
                                            placeholder="finish"
                                            onChange={(e) => updateSubItem(i, { finish: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <input
                                            type="number"
                                            className={inputCls}
                                            value={r.width_mm}
                                            placeholder="W (mm)"
                                            onChange={(e) => updateSubItem(i, { width_mm: e.target.value })}
                                        />
                                        <input
                                            type="number"
                                            className={inputCls}
                                            value={r.height_mm}
                                            placeholder="H (mm)"
                                            onChange={(e) => updateSubItem(i, { height_mm: e.target.value })}
                                        />
                                        <input
                                            type="number"
                                            className={inputCls}
                                            value={r.returns_mm}
                                            placeholder="R (mm)"
                                            onChange={(e) => updateSubItem(i, { returns_mm: e.target.value })}
                                        />
                                        <input
                                            type="number"
                                            min={1}
                                            className={inputCls}
                                            value={r.quantity}
                                            placeholder="qty"
                                            onChange={(e) => updateSubItem(i, { quantity: e.target.value })}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className={labelCls}>spec notes (optional)</label>
                <textarea
                    className={inputCls}
                    rows={2}
                    value={specNotes}
                    onChange={(e) => setSpecNotes(e.target.value)}
                    placeholder="RAL colour, shadow gap, push-through, any extra spec info..."
                />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
                <button
                    type="button"
                    onClick={onDone}
                    className="btn-secondary"
                >
                    cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="btn-primary inline-flex items-center gap-2"
                >
                    {pending && <Loader2 size={16} className="animate-spin" />}
                    {pending ? 'adding…' : isService ? 'add service' : 'add line item'}
                </button>
            </div>
        </div>
    );
}
