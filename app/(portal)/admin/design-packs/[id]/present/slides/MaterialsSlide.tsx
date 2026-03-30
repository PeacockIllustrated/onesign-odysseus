import { DesignPack } from '@/lib/design-packs/types';
import { getCostTierSymbol, getCostTierLabel } from '@/lib/design-packs/utils';
import { Star } from 'lucide-react';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function MaterialsSlide({ pack }: SlideProps) {
    const materials = pack.data_json.materials;

    if (!materials) {
        return (
            <div className="h-full flex items-center justify-center p-12">
                <div className="text-center">
                    <h2 className="text-4xl font-bold mb-4">materials & finishes</h2>
                    <p className="text-white/60">no materials selected yet</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center p-12">
            <h2 className="text-3xl font-bold mb-12">materials & finishes</h2>

            <div className="max-w-3xl w-full space-y-8">
                <div className="bg-white/5 rounded-lg p-8 border border-white/10">
                    <h3 className="text-2xl font-medium mb-4">substrate</h3>
                    <p className="text-4xl font-bold mb-2">{materials.substrate}</p>
                    <div className="flex items-center gap-4 text-sm text-white/60">
                        <span>cost tier: {getCostTierSymbol(materials.cost_tier)} ({getCostTierLabel(materials.cost_tier)})</span>
                    </div>
                </div>

                <div className="bg-white/5 rounded-lg p-8 border border-white/10">
                    <h3 className="text-2xl font-medium mb-4">finish</h3>
                    <p className="text-4xl font-bold">{materials.finish}</p>
                </div>

                <div className="text-sm text-white/40 pt-8 border-t border-white/10">
                    <p>these materials have been selected for durability, aesthetic quality, and suitability for outdoor signage in northern england weather conditions</p>
                </div>
            </div>
        </div>
    );
}
