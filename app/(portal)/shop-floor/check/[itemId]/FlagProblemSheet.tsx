'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    jobItemId: string;
    stageId: string | null;
    onClose: () => void;
    onSubmitted: () => void;
}
export function FlagProblemSheet(_: Props) {
    return <div data-stub="flag-sheet" />;
}
