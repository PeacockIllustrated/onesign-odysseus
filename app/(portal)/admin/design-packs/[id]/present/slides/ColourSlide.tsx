import { DesignPack } from '@/lib/design-packs/types';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function ColourSlide({ pack }: SlideProps) {
    const colours = pack.data_json.colours;

    if (!colours) {
        return (
            <div className="h-full flex items-center justify-center p-12">
                <div className="text-center">
                    <h2 className="text-4xl font-bold mb-4">colour palette</h2>
                    <p className="text-white/60">no colours selected yet</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center p-12">
            <h2 className="text-3xl font-bold mb-12">colour palette</h2>

            <div className="grid grid-cols-2 gap-8 max-w-4xl w-full">
                {/* Primary */}
                <div>
                    <div
                        className="w-full h-48 rounded-lg mb-4"
                        style={{ backgroundColor: colours.primary.hex }}
                    />
                    <p className="text-xl font-medium">{colours.primary.name}</p>
                    <p className="text-sm text-white/60 font-mono">{colours.primary.hex}</p>
                    {colours.primary.wcag_contrast_ratio && (
                        <p className="text-xs text-white/40 mt-1">
                            contrast: {colours.primary.wcag_contrast_ratio}:1
                        </p>
                    )}
                </div>

                {/* Secondary */}
                <div>
                    <div
                        className="w-full h-48 rounded-lg mb-4 border border-white/20"
                        style={{ backgroundColor: colours.secondary.hex }}
                    />
                    <p className="text-xl font-medium">{colours.secondary.name}</p>
                    <p className="text-sm text-white/60 font-mono">{colours.secondary.hex}</p>
                </div>

                {/* Accents */}
                {colours.accents.map((accent, idx) => (
                    <div key={idx}>
                        <div
                            className="w-full h-32 rounded-lg mb-4"
                            style={{ backgroundColor: accent.hex }}
                        />
                        <p className="text-lg font-medium">{accent.name}</p>
                        <p className="text-sm text-white/60 font-mono">{accent.hex}</p>
                        {accent.wcag_contrast_ratio && (
                            <p className="text-xs text-white/40 mt-1">
                                contrast: {accent.wcag_contrast_ratio}:1
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
