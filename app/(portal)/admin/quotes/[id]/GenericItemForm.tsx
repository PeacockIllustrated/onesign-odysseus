'use client';

/**
 * Form for adding a generic (manual-priced) quote line item.
 *
 * UX shape:
 *   1. a compact "is this a service?" row at the very top
 *   2. the essentials block — name, W×H×R, qty, unit price — everything
 *      needed for 90% of lines
 *   3. collapsibles for "more details" (description, component type,
 *      lighting, discount/markup, spec notes) and "multi-part sub-items"
 *      (only needed when one line item contains several distinct parts —
 *      e.g. a panel with vinyl letters on it)
 *
 * Everything the user fills in flows through to artwork skeleton generation
 * on quote acceptance.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
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

    // Top-level shape
    const [isService, setIsService] = useState(false);
    const [serviceType, setServiceType] = useState('');

    // Essentials
    const [partLabel, setPartLabel] = useState('');
    const [widthMm, setWidthMm] = useState('');
    const [heightMm, setHeightMm] = useState('');
    const [returnsMm, setReturnsMm] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [unitPrice, setUnitPrice] = useState('');

    // Advanced (collapsibles)
    const [showMoreDetails, setShowMoreDetails] = useState(false);
    const [showSubItems, setShowSubItems] = useState(false);
    const [description, setDescription] = useState('');
    const [componentType, setComponentType] = useState('');
    const [discountPercent, setDiscountPercent] = useState('0');
    const [markupPercent, setMarkupPercent] = useState('0');
    const [lighting, setLighting] = useState('');
    const [specNotes, setSpecNotes] = useState('');
    const [subItems, setSubItems] = useState<SubItemRow[]>([]);

    const updateSubItem = (i: number, patch: Partial<SubItemRow>) => {
        setSubItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    };

    // Live preview of the line total so staff can sanity-check as they type.
    const qtyNum = Number(quantity) || 1;
    const unitNum = Number(unitPrice) || 0;
    const discNum = Number(discountPercent) || 0;
    const markNum = Number(markupPercent) || 0;
    const lineTotalPreview =
        unitNum * qtyNum * (1 - discNum / 100) * (1 + markNum / 100);

    const submit = () => {
        setError(null);

        const effectiveLabel = isService
            ? (partLabel.trim() || serviceType.trim())
            : partLabel.trim();

        if (isService && !serviceType) {
            setError('please pick a service type (fitting, removal, survey)');
            return;
        }
        if (!effectiveLabel) {
            setError('item name is required');
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
                width_mm: isService || !widthMm ? undefined : Number(widthMm),
                height_mm: isService || !heightMm ? undefined : Number(heightMm),
                returns_mm: isService || !returnsMm ? undefined : Number(returnsMm),
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
            setWidthMm('');
            setHeightMm('');
            setReturnsMm('');
            setDescription('');
            setComponentType('');
            setQuantity('1');
            setUnitPrice('');
            setDiscountPercent('0');
            setMarkupPercent('0');
            setLighting('');
            setSpecNotes('');
            setSubItems([]);
            setShowMoreDetails(false);
            setShowSubItems(false);
            onDone?.();
            router.refresh();
        });
    };

    const inputCls =
        'w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';
    const labelCls = 'block text-xs font-medium text-neutral-700 mb-1';
    const sectionCls = 'pt-4 border-t border-neutral-200';

    return (
        <div className="space-y-5">
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* 1. Line shape — service or production work */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded space-y-3">
                <label className="flex items-start gap-2 text-sm text-neutral-800 cursor-pointer">
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
                        <span className="text-neutral-500"> — fitting, removal, or survey (no artwork, no production)</span>
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

            {/* 2. Essentials */}
            <div className="space-y-3">
                <div>
                    <label className={labelCls}>
                        {isService ? 'name (optional — defaults to service type)' : 'item name *'}
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

                {!isService && (
                    <div>
                        <label className={labelCls}>dimensions (mm)</label>
                        <div className="grid grid-cols-3 gap-2">
                            <input
                                type="number"
                                min={0}
                                className={inputCls}
                                value={widthMm}
                                placeholder="width"
                                onChange={(e) => setWidthMm(e.target.value)}
                            />
                            <input
                                type="number"
                                min={0}
                                className={inputCls}
                                value={heightMm}
                                placeholder="height"
                                onChange={(e) => setHeightMm(e.target.value)}
                            />
                            <input
                                type="number"
                                className={inputCls}
                                value={returnsMm}
                                placeholder="returns (optional)"
                                onChange={(e) => setReturnsMm(e.target.value)}
                            />
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-1">
                            carried through to the artwork skeleton — saves re-typing later
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
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
                            placeholder="0.00"
                        />
                    </div>
                </div>

                {unitNum > 0 && (
                    <div className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded px-3 py-2 flex items-center justify-between">
                        <span>line total</span>
                        <span className="font-mono font-semibold text-neutral-900">
                            £{(lineTotalPreview / 1).toFixed(2)}
                        </span>
                    </div>
                )}
            </div>

            {/* 3. More details — collapsible */}
            <div className={sectionCls}>
                <button
                    type="button"
                    onClick={() => setShowMoreDetails(!showMoreDetails)}
                    className="w-full flex items-center justify-between text-sm text-neutral-700 hover:text-black"
                >
                    <span className="font-medium">
                        more details
                        <span className="text-neutral-400 font-normal ml-2">
                            description, discount, markup, {isService ? 'notes' : 'component type, lighting, notes'}
                        </span>
                    </span>
                    {showMoreDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showMoreDetails && (
                    <div className="mt-3 space-y-3">
                        <div>
                            <label className={labelCls}>description</label>
                            <textarea
                                className={inputCls}
                                rows={2}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="free-form description, colour, material notes…"
                            />
                        </div>

                        {!isService && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                    <label className={labelCls}>lighting</label>
                                    <input
                                        className={inputCls}
                                        value={lighting}
                                        onChange={(e) => setLighting(e.target.value)}
                                        placeholder="internal led, halo, backlit…"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
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

                        <div>
                            <label className={labelCls}>spec notes</label>
                            <textarea
                                className={inputCls}
                                rows={2}
                                value={specNotes}
                                onChange={(e) => setSpecNotes(e.target.value)}
                                placeholder="RAL colour, shadow gap, push-through, any extra spec info…"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 4. Sub-items — collapsible, only for production work */}
            {!isService && (
                <div className={sectionCls}>
                    <button
                        type="button"
                        onClick={() => setShowSubItems(!showSubItems)}
                        className="w-full flex items-center justify-between text-sm text-neutral-700 hover:text-black"
                    >
                        <span className="font-medium">
                            multi-part breakdown
                            <span className="text-neutral-400 font-normal ml-2">
                                only if this one line contains several distinct parts
                                {subItems.length > 0 && ` · ${subItems.length} added`}
                            </span>
                        </span>
                        {showSubItems ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {showSubItems && (
                        <div className="mt-3 space-y-3">
                            <p className="text-xs text-neutral-500">
                                skip this if the dimensions above already describe the whole line.
                                use it only when one line is e.g. a panel <em>plus</em> vinyl letters —
                                each sub-part needs its own material/finish/size.
                            </p>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setSubItems((prev) => [...prev, emptyRow()])}
                                    className="btn-secondary text-xs inline-flex items-center gap-1"
                                >
                                    <Plus size={12} /> add sub-part
                                </button>
                            </div>
                            {subItems.length === 0 ? (
                                <p className="text-xs text-neutral-400 italic">
                                    no sub-parts yet
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
                                                    placeholder="method (stuck to face, weeded…)"
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
                </div>
            )}

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
