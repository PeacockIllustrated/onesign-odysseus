'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    stageInstructions: string[];
    onNext: () => void;
    onReportProblem: () => void;
}
export function StepLook(_: Props) {
    return <div data-stub="step-look" />;
}
