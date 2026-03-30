import { DesignPack } from '@/lib/design-packs/types';
import { Circle, Disc, Target } from 'lucide-react';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function GraphicStyleSlide({ pack }: SlideProps) {
    const graphicStyle = pack.data_json.graphic_style;

    if (!graphicStyle) {
        return (
            <div className="h-full flex items-center justify-center p-12">
                <div className="text-center">
                    <h2 className="text-4xl font-bold mb-4">graphic style</h2>
                    <p className="text-white/60">no style selected yet</p>
                </div>
            </div>
        );
    }

    const getIconExample = () => {
        switch (graphicStyle.icon_family) {
            case 'line':
                return (
                    <div className="flex gap-8">
                        <Circle size={80} strokeWidth={1.5} />
                        <Target size={80} strokeWidth={1.5} />
                        <Disc size={80} strokeWidth={1.5} />
                    </div>
                );
            case 'filled':
                return (
                    <div className="flex gap-8">
                        <Circle size={80} fill="currentColor" />
                        <Disc size={80} fill="currentColor" />
                        <Target size={80} fill="currentColor" />
                    </div>
                );
            case 'duotone':
                return (
                    <div className="flex gap-8">
                        <Circle size={80} strokeWidth={2} fill="currentColor" opacity={0.3} />
                        <Disc size={80} strokeWidth={2} fill="currentColor" opacity={0.3} />
                        <Target size={80} strokeWidth={2} fill="currentColor" opacity={0.3} />
                    </div>
                );
            case 'illustrative':
                return (
                    <div className="flex gap-8">
                        <Circle size={80} strokeWidth={2.5} />
                        <Target size={80} strokeWidth={2.5} />
                        <Disc size={80} strokeWidth={2.5} />
                    </div>
                );
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-center p-12">
            <h2 className="text-3xl font-bold mb-12">graphic style</h2>

            <div className="text-center max-w-3xl">
                <div className="mb-12">{getIconExample()}</div>

                <h3 className="text-2xl font-medium mb-4">{graphicStyle.icon_family} icons</h3>

                {graphicStyle.pattern_style && graphicStyle.pattern_style !== 'none' && (
                    <p className="text-xl text-white/60 mb-8">
                        with {graphicStyle.pattern_style} background pattern
                    </p>
                )}

                <div className="text-sm text-white/40 mt-12">
                    <p>this style will be applied to all wayfinding and information signage</p>
                </div>
            </div>
        </div>
    );
}
