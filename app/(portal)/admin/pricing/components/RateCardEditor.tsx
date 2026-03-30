'use client';

/**
 * RateCardEditor Component
 * 
 * Tabbed editor for all rate card tables.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RateCardTableComponent } from './RateCardTable';
import { CompletenessPanel } from './CompletenessPanel';

interface RateCards {
    panelPrices: Record<string, unknown>[];
    panelFinishes: Record<string, unknown>[];
    manufacturingRates: Record<string, unknown>[];
    illuminationProfiles: Record<string, unknown>[];
    transformers: Record<string, unknown>[];
    opalPrices: Record<string, unknown>[];
    consumables: Record<string, unknown>[];
    letterFinishRules: Record<string, unknown>[];
    letterPriceTable: Record<string, unknown>[];
}

interface RateCardEditorProps {
    pricingSetId: string;
    pricingSetStatus: string;
    rateCards: RateCards;
}

const TABS = [
    { key: 'panel_prices', label: 'Panel Prices' },
    { key: 'panel_finishes', label: 'Panel Finishes' },
    { key: 'manufacturing_rates', label: 'Manufacturing Rates' },
    { key: 'illumination_profiles', label: 'Illumination' },
    { key: 'transformers', label: 'Transformers' },
    { key: 'opal_prices', label: 'Opal Prices' },
    { key: 'consumables', label: 'Consumables' },
    { key: 'letter_finish_rules', label: 'Letter Finish Rules' },
    { key: 'letter_price_table', label: 'Letter Prices' },
] as const;

const PANEL_MATERIALS = ['Aluminium 2.5mm', 'Aluminium 3mm', 'Aluminium Composite', 'Dibond', 'Foamex'];
const PANEL_SIZES = ['2.4 x 1.2', '3 x 1.5'];
const PANEL_FINISHES = ['Powder Coating', 'Wet Spray', 'Vinyl Wrap', 'Brushed', 'Polished'];
const TASKS = ['router', 'fabrication', 'assembly', 'vinyl', 'print'];
const TRANSFORMER_TYPES = ['20W', '60W', '100W', '150W'];
const OPAL_TYPES = ['Opal (5mm)', 'Opal (10mm)'];
const LETTER_TYPES = ['Fabricated', 'Komacel', 'Acrylic'];
const LETTER_FINISHES = ['Powder Coating', 'Wet Spray', 'Brushed', 'Polished', 'Painted', 'Vinyl Faced', 'Clear', 'Opal', 'Coloured'];
const HEIGHTS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];

type TabKey = typeof TABS[number]['key'];

export function RateCardEditor({ pricingSetId, pricingSetStatus, rateCards }: RateCardEditorProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabKey>('panel_prices');
    const [refreshKey, setRefreshKey] = useState(0);

    const isEditable = pricingSetStatus === 'draft';

    const handleRefresh = () => {
        setRefreshKey(k => k + 1);
        router.refresh();
    };

    const getColumnsAndData = (tab: TabKey) => {
        switch (tab) {
            case 'panel_prices':
                return {
                    columns: [
                        { key: 'material', label: 'Material', type: 'select' as const, options: PANEL_MATERIALS },
                        { key: 'sheet_size', label: 'Sheet Size', type: 'select' as const, options: PANEL_SIZES },
                        { key: 'unit_cost_pence', label: 'Unit Cost', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.panelPrices,
                };
            case 'panel_finishes':
                return {
                    columns: [
                        { key: 'finish', label: 'Finish', type: 'select' as const, options: PANEL_FINISHES },
                        { key: 'cost_per_m2_pence', label: 'Cost per m²', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.panelFinishes,
                };
            case 'manufacturing_rates':
                return {
                    columns: [
                        { key: 'task', label: 'Task', type: 'select' as const, options: TASKS },
                        { key: 'cost_per_hour_pence', label: 'Cost per Hour', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.manufacturingRates,
                };
            case 'illumination_profiles':
                return {
                    columns: [
                        { key: 'height_mm', label: 'Height (mm)', type: 'select' as const, options: HEIGHTS.map(String) },
                        { key: 'leds_per_letter', label: 'LEDs per Letter', type: 'number' as const },
                    ],
                    data: rateCards.illuminationProfiles,
                };
            case 'transformers':
                return {
                    columns: [
                        { key: 'type', label: 'Type', type: 'select' as const, options: TRANSFORMER_TYPES },
                        { key: 'led_capacity', label: 'LED Capacity', type: 'number' as const },
                        { key: 'unit_cost_pence', label: 'Unit Cost', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.transformers,
                };
            case 'opal_prices':
                return {
                    columns: [
                        { key: 'opal_type', label: 'Opal Type', type: 'select' as const, options: OPAL_TYPES },
                        { key: 'sheet_size', label: 'Sheet Size', type: 'select' as const, options: PANEL_SIZES },
                        { key: 'unit_cost_pence', label: 'Unit Cost', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.opalPrices,
                };
            case 'consumables':
                return {
                    columns: [
                        { key: 'key', label: 'Key', type: 'text' as const },
                        { key: 'value_pence', label: 'Value', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.consumables,
                };
            case 'letter_finish_rules':
                return {
                    columns: [
                        { key: 'letter_type', label: 'Letter Type', type: 'select' as const, options: LETTER_TYPES },
                        { key: 'allowed_finish', label: 'Allowed Finish', type: 'select' as const, options: LETTER_FINISHES },
                    ],
                    data: rateCards.letterFinishRules,
                };
            case 'letter_price_table':
                return {
                    columns: [
                        { key: 'letter_type', label: 'Type', type: 'select' as const, options: LETTER_TYPES },
                        { key: 'finish', label: 'Finish', type: 'select' as const, options: LETTER_FINISHES },
                        { key: 'height_mm', label: 'Height (mm)', type: 'select' as const, options: HEIGHTS.map(String) },
                        { key: 'unit_price_pence', label: 'Unit Price', type: 'number' as const, suffix: 'pence' },
                    ],
                    data: rateCards.letterPriceTable,
                };
            default:
                return { columns: [], data: [] };
        }
    };

    const { columns, data } = getColumnsAndData(activeTab);

    return (
        <div className="space-y-6">
            {/* Completeness Panel */}
            <CompletenessPanel pricingSetId={pricingSetId} refreshKey={refreshKey} />

            {/* Tabs */}
            <div className="border-b border-neutral-200">
                <div className="flex flex-wrap gap-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab.key
                                    ? 'border-black text-black'
                                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                                }`}
                        >
                            {tab.label}
                            <span className="ml-1 text-xs text-neutral-400">
                                ({data.length})
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <RateCardTableComponent
                table={activeTab}
                pricingSetId={pricingSetId}
                columns={columns}
                data={data}
                isEditable={isEditable}
                onRefresh={handleRefresh}
            />

            {!isEditable && (
                <p className="text-sm text-neutral-500 italic">
                    This pricing set is {pricingSetStatus} and cannot be edited.
                </p>
            )}
        </div>
    );
}
