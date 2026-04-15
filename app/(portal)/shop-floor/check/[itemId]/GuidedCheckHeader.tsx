'use client';
import type { ShopFloorCheckContext, ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import type { StepName } from './GuidedCheckClient';

interface Props {
    ctx: ShopFloorCheckContext;
    subItem: ShopFloorSubItem;
    subIdx: number;
    totalSubItems: number;
    step: StepName;
    onBack: () => void;
}
export function GuidedCheckHeader(_: Props) {
    return <div data-stub="header" />;
}
