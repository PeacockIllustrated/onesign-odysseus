'use client';

import { ArtworkComponentWithVersions, DIMENSION_TOLERANCE_MM } from '@/lib/artwork/types';
import { AlertTriangle, Check } from 'lucide-react';

interface DimensionAlertProps {
    component: ArtworkComponentWithVersions;
}

export function DimensionAlert({ component }: DimensionAlertProps) {
    if (!component.dimension_flag || !component.width_deviation_mm || !component.height_deviation_mm) {
        return null;
    }

    const hasExtraItems = component.extra_items?.length > 0;
    const anyOutOfTolerance = component.dimension_flag === 'out_of_tolerance' ||
        component.extra_items?.some(i => i.dimension_flag === 'out_of_tolerance');
    const widthDev = Number(component.width_deviation_mm);
    const heightDev = Number(component.height_deviation_mm);

    const bgClass = anyOutOfTolerance ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200';
    const IconComponent = anyOutOfTolerance ? AlertTriangle : Check;
    const iconColor = anyOutOfTolerance ? 'text-red-600' : 'text-green-600';
    const titleColor = anyOutOfTolerance ? 'text-red-800' : 'text-green-800';
    const subtitleColor = anyOutOfTolerance ? 'text-red-600' : 'text-green-600';
    const titleText = anyOutOfTolerance ? 'out of tolerance' : 'dimensions within tolerance';

    return (
        <div className={`p-3 border rounded-[var(--radius-sm)] ${bgClass}`}>
            <div className="flex items-center gap-2 mb-2">
                <IconComponent size={16} className={iconColor} />
                <span className={`text-sm font-medium ${titleColor}`}>{titleText}</span>
                <span className={`text-xs ml-auto ${subtitleColor}`}>(+/- {DIMENSION_TOLERANCE_MM}mm)</span>
            </div>

            {/* Primary item */}
            {hasExtraItems && (
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">item A</p>
            )}
            <div className="grid grid-cols-2 gap-4 text-xs">
                <DimensionRow
                    label="width"
                    spec={Number(component.width_mm)}
                    measured={Number(component.measured_width_mm)}
                    deviation={widthDev}
                    pass={Math.abs(widthDev) <= DIMENSION_TOLERANCE_MM}
                />
                <DimensionRow
                    label="height"
                    spec={Number(component.height_mm)}
                    measured={Number(component.measured_height_mm)}
                    deviation={heightDev}
                    pass={Math.abs(heightDev) <= DIMENSION_TOLERANCE_MM}
                />
            </div>

            {/* Extra items */}
            {component.extra_items?.filter(item => item.dimension_flag).map((item) => {
                const wDev = Number(item.width_deviation_mm);
                const hDev = Number(item.height_deviation_mm);
                return (
                    <div key={item.id} className="mt-2 pt-2 border-t border-neutral-200">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">item {item.label}</p>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <DimensionRow
                                label="width"
                                spec={Number(item.width_mm)}
                                measured={Number(item.measured_width_mm)}
                                deviation={wDev}
                                pass={Math.abs(wDev) <= DIMENSION_TOLERANCE_MM}
                            />
                            <DimensionRow
                                label="height"
                                spec={Number(item.height_mm)}
                                measured={Number(item.measured_height_mm)}
                                deviation={hDev}
                                pass={Math.abs(hDev) <= DIMENSION_TOLERANCE_MM}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function DimensionRow({
    label,
    spec,
    measured,
    deviation,
    pass,
}: {
    label: string;
    spec: number;
    measured: number;
    deviation: number;
    pass: boolean;
}) {
    const sign = deviation > 0 ? '+' : '';

    return (
        <div>
            <p className="text-neutral-500 mb-1">{label}</p>
            <p className="text-neutral-700">
                {spec}mm (spec) vs {measured}mm (measured)
            </p>
            <p className={pass ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {sign}{deviation}mm — {pass ? 'PASS' : 'FAIL'}
            </p>
        </div>
    );
}
