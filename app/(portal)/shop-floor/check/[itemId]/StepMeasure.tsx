'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onChangeW: (v: string) => void;
    onChangeH: (v: string) => void;
    onNext: () => void;
    onReportProblem: () => void;
}
export function StepMeasure(_: Props) {
    return <div data-stub="step-measure" />;
}
