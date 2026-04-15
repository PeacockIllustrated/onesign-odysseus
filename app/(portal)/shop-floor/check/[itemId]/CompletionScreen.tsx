'use client';
import type { ShopFloorCheckContext } from '@/lib/production/shop-floor-actions';

interface Props {
    ctx: ShopFloorCheckContext;
    onDone: () => void;
}
export function CompletionScreen(_: Props) {
    return <div data-stub="completion" />;
}
