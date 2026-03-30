'use client';

/**
 * QuoteSummary Component
 * 
 * Displays the calculated breakdown from the pricing engine.
 * Maintains layout stability during recalculation.
 */

import type { PanelLettersV1Output } from '@/lib/quoter/types';
import { Loader2, AlertTriangle } from 'lucide-react';

interface QuoteSummaryProps {
    output: PanelLettersV1Output | null;
    isCalculating?: boolean;
}

function formatPence(pence: number): string {
    return `£${(pence / 100).toFixed(2)}`;
}

export function QuoteSummary({ output, isCalculating }: QuoteSummaryProps) {
    // Show placeholder only if no output yet
    if (!output) {
        return (
            <div className="p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200 min-h-[300px] flex items-center justify-center">
                {isCalculating ? (
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                        <Loader2 size={16} className="animate-spin" />
                        Calculating...
                    </div>
                ) : (
                    <p className="text-sm text-neutral-500 text-center">
                        Fill in the form to see the breakdown
                    </p>
                )}
            </div>
        );
    }

    if (!output.ok) {
        return (
            <div className="p-4 bg-red-50 rounded-[var(--radius-sm)] border border-red-200 min-h-[300px]">
                <h3 className="text-sm font-semibold text-red-800 mb-2">Validation Errors</h3>
                <ul className="text-xs text-red-700 space-y-1">
                    {output.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                    ))}
                </ul>
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Loading overlay - subtle, doesn't hide content */}
            {isCalculating && (
                <div className="absolute top-2 right-2 z-10">
                    <div className="flex items-center gap-1 px-2 py-1 bg-white/90 rounded text-xs text-neutral-500 shadow-sm">
                        <Loader2 size={12} className="animate-spin" />
                        Updating
                    </div>
                </div>
            )}

            <div className={`p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200 space-y-4 transition-opacity ${isCalculating ? 'opacity-70' : 'opacity-100'}`}>
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-900">Breakdown</h3>
                    {output.overrides && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded uppercase tracking-wider">
                            <AlertTriangle size={10} />
                            Override
                        </span>
                    )}
                </div>

                {/* Warnings */}
                {output.warnings.length > 0 && (
                    <div className="p-2 bg-amber-50 rounded border border-amber-200">
                        <ul className="text-xs text-amber-700 space-y-1">
                            {output.warnings.map((warning, i) => (
                                <li key={i}>⚠️ {warning}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Derived quantities */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Panels needed:</span>
                        <span className="font-medium">{output.derived.panels_needed} ({output.derived.panels_x} × {output.derived.panels_y})</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Area:</span>
                        <span className="font-medium">{output.derived.area_m2.toFixed(2)} m²</span>
                    </div>
                    {output.derived.aperture_leds > 0 && (
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Aperture LEDs:</span>
                            <span className="font-medium">{output.derived.aperture_leds}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Letter LEDs:</span>
                        <span className="font-medium">{output.derived.letters_total_leds}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Total LEDs:</span>
                        <span className="font-medium">{output.derived.total_leds}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Transformers:</span>
                        <span className="font-medium">{output.derived.transformers_needed}</span>
                    </div>
                </div>

                <hr className="border-neutral-200" />

                {/* Cost breakdown */}
                <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Panel material:</span>
                        <span>{formatPence(output.costs.panel_material_cost_pence)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Panel finish:</span>
                        <span>{formatPence(output.costs.panel_finish_cost_pence)}</span>
                    </div>
                    {output.costs.opal_cost_pence > 0 && (
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Opal:</span>
                            <span>{formatPence(output.costs.opal_cost_pence)}</span>
                        </div>
                    )}
                    {output.costs.aperture_led_cost_pence > 0 && (
                        <div className="flex justify-between">
                            <span className="text-neutral-500">Aperture LEDs:</span>
                            <span>{formatPence(output.costs.aperture_led_cost_pence)}</span>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Transformers:</span>
                        <span>{formatPence(output.costs.transformer_cost_pence)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Letters total:</span>
                        <span>{formatPence(output.costs.letters_total_cost_pence)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Labour:</span>
                        <span>{formatPence(output.costs.labour_cost_pence)}</span>
                    </div>

                    <hr className="border-neutral-200" />

                    <div className="flex justify-between">
                        <span className="text-neutral-500">Materials base:</span>
                        <span>{formatPence(output.costs.materials_base_pence)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-neutral-500">Markup:</span>
                        <span>{formatPence(output.costs.materials_markup_pence)}</span>
                    </div>
                </div>

                <hr className="border-neutral-200" />

                {/* Letter sets breakdown */}
                {output.letter_sets_breakdown.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-medium text-neutral-700">Letter Sets</h4>
                        {output.letter_sets_breakdown.map((set, i) => (
                            <div key={i} className="text-xs bg-white p-2 rounded border border-neutral-100">
                                <div className="flex justify-between">
                                    <span className="font-medium">{set.qty}× {set.type} ({set.height_mm}mm)</span>
                                    <span>{formatPence(set.total_pence)}</span>
                                </div>
                                <div className="text-neutral-500">
                                    {set.finish}{set.illuminated ? ` • ${set.leds_count} LEDs` : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Total */}
                <div className="pt-2 border-t-2 border-neutral-300">
                    <div className="flex justify-between text-sm font-bold">
                        <span>Line Total:</span>
                        <span className="text-lg">{formatPence(output.line_total_pence)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
