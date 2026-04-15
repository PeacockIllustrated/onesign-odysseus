'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onSignedOff: () => void;
    onReportProblem: () => void;
}
export function StepConfirm(_: Props) {
    return <div data-stub="step-confirm" />;
}
