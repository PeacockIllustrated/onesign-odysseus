'use client';

import { Trash2, Plus, X } from 'lucide-react';
import type { SurveyPhotoWithUrl } from '@/lib/site-surveys/types';
import { SketchPreview } from './SketchPreview';
import { PhotoGrid } from './PhotoGrid';
import { toMeasurements, type EditItem } from './editor-types';
import {
    panelCls,
    labelCls,
    inputCls,
    sectionTitleCls,
    checkboxCls,
} from '../ui';

const FLAGS: { key: keyof EditItem; label: string }[] = [
    { key: 'has_returns', label: 'Returns' },
    { key: 'shadow_gap_required', label: 'Shadow gap' },
    { key: 'new_fascia_required', label: 'New fascia' },
    { key: 'illuminated', label: 'Illuminated' },
];

function NumField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <label className={labelCls}>{label}</label>
            <input
                type="number"
                inputMode="decimal"
                min={0}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={inputCls}
                placeholder="mm"
            />
        </div>
    );
}

export function ItemEditor({
    item,
    index,
    photos,
    surveyId,
    onChange,
    onRemove,
    onAddPhoto,
    onUpdatePhoto,
    onDeletePhoto,
}: {
    item: EditItem;
    index: number;
    photos: SurveyPhotoWithUrl[];
    surveyId: string;
    onChange: (patch: Partial<EditItem>) => void;
    onRemove: () => void;
    onAddPhoto: (photo: SurveyPhotoWithUrl) => void;
    onUpdatePhoto: (photo: SurveyPhotoWithUrl) => void;
    onDeletePhoto: (id: string) => void;
}) {
    const measurements = toMeasurements(item);

    return (
        <div className={`${panelCls} space-y-4 p-5`}>
            {/* Header */}
            <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4e7e8c] text-xs font-bold text-white">
                    {index + 1}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label className={labelCls}>Item label *</label>
                        <input
                            value={item.label}
                            onChange={(e) => onChange({ label: e.target.value })}
                            className={inputCls}
                            placeholder="e.g. Main fascia"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Sign type</label>
                        <input
                            value={item.sign_type}
                            onChange={(e) => onChange({ sign_type: e.target.value })}
                            className={inputCls}
                            placeholder="e.g. fascia / projecting / letters"
                        />
                    </div>
                </div>
                <button
                    onClick={onRemove}
                    className="shrink-0 rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove item"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Measurements + sketch */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <NumField label="Width" value={item.width} onChange={(v) => onChange({ width: v })} />
                        <NumField label="Height" value={item.height} onChange={(v) => onChange({ height: v })} />
                        <NumField label="Depth" value={item.depth} onChange={(v) => onChange({ depth: v })} />
                        <NumField label="Return depth" value={item.returnDepth} onChange={(v) => onChange({ returnDepth: v })} />
                        <NumField label="Shadow gap" value={item.shadowGap} onChange={(v) => onChange({ shadowGap: v })} />
                    </div>

                    {/* Extra dimensions */}
                    <div className="space-y-2">
                        {item.extra.map((ex, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input
                                    value={ex.label}
                                    onChange={(e) => {
                                        const extra = [...item.extra];
                                        extra[i] = { ...extra[i], label: e.target.value };
                                        onChange({ extra });
                                    }}
                                    className={inputCls}
                                    placeholder="label e.g. letter height"
                                />
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    value={ex.value}
                                    onChange={(e) => {
                                        const extra = [...item.extra];
                                        extra[i] = { ...extra[i], value: e.target.value };
                                        onChange({ extra });
                                    }}
                                    className={`${inputCls} max-w-[120px]`}
                                    placeholder="mm"
                                />
                                <button
                                    onClick={() =>
                                        onChange({
                                            extra: item.extra.filter((_, j) => j !== i),
                                        })
                                    }
                                    className="rounded p-1.5 text-neutral-400 hover:text-red-600"
                                    title="Remove dimension"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() =>
                                onChange({
                                    extra: [...item.extra, { label: '', value: '' }],
                                })
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#4e7e8c] hover:text-[#3a5f6a]"
                        >
                            <Plus size={13} /> add dimension
                        </button>
                    </div>

                    {/* Spec flags */}
                    <div className="flex flex-wrap gap-3 pt-1">
                        {FLAGS.map(({ key, label }) => (
                            <label
                                key={key}
                                className="inline-flex items-center gap-1.5 text-sm text-neutral-700"
                            >
                                <input
                                    type="checkbox"
                                    checked={item[key] as boolean}
                                    onChange={(e) => onChange({ [key]: e.target.checked } as Partial<EditItem>)}
                                    className={checkboxCls}
                                />
                                {label}
                            </label>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className={labelCls}>Fixing substrate</label>
                            <input
                                value={item.fixing_substrate}
                                onChange={(e) => onChange({ fixing_substrate: e.target.value })}
                                className={inputCls}
                                placeholder="e.g. brick / cladding / ACM"
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelCls}>Item notes</label>
                        <textarea
                            value={item.item_notes}
                            onChange={(e) => onChange({ item_notes: e.target.value })}
                            rows={2}
                            className={inputCls}
                            placeholder="anything the designer should know"
                        />
                    </div>
                </div>

                {/* Live sketch */}
                <div>
                    <div className={`mb-1.5 ${sectionTitleCls}`}>Generated sketch</div>
                    <SketchPreview
                        measurements={measurements}
                        options={{
                            hasReturns: item.has_returns,
                            shadowGap: item.shadow_gap_required,
                            title: item.label || `Item ${index + 1}`,
                        }}
                    />
                </div>
            </div>

            {/* Photos for this item */}
            <div>
                <div className={`mb-1.5 ${sectionTitleCls}`}>Photos for this item</div>
                <PhotoGrid
                    surveyId={surveyId}
                    itemId={item.id ?? null}
                    photos={photos}
                    onAdd={onAddPhoto}
                    onUpdate={onUpdatePhoto}
                    onDelete={onDeletePhoto}
                    canUpload={!!item.id}
                    hint="Save the survey first to attach photos to this item."
                />
            </div>
        </div>
    );
}
