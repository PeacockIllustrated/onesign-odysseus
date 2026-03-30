import { DesignPack } from '@/lib/design-packs/types';
import { FONT_CATALOG, SIGNAGE_TYPOGRAPHY_LEVELS } from '@/lib/design-packs/font-catalog';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function TypographySlide({ pack }: SlideProps) {
    const typography = pack.data_json.typography;

    if (!typography) {
        return (
            <div className="h-full flex items-center justify-center p-12">
                <div className="text-center">
                    <h2 className="text-4xl font-bold mb-4">typography</h2>
                    <p className="text-white/60">no fonts selected yet</p>
                </div>
            </div>
        );
    }

    const selectedPair = FONT_CATALOG.find(
        (pair) => pair.primary_font.family === typography.primary_font.family
    );

    return (
        <div className="h-full flex flex-col items-center justify-center p-12">
            <h2 className="text-3xl font-bold mb-12">typography</h2>

            <div className="max-w-5xl w-full space-y-8">
                {selectedPair && (
                    <>
                        <div
                            style={{
                                fontFamily: `"${typography.primary_font.family}", sans-serif`,
                                fontWeight: typography.primary_font.weight,
                            }}
                        >
                            <div className="text-7xl mb-4">visitor centre</div>
                            <div className="text-5xl text-white/80 mb-4">main entrance</div>
                            <div className="text-3xl text-white/60">200 metres ahead</div>
                        </div>

                        <div
                            style={{
                                fontFamily: `"${typography.secondary_font.family}", sans-serif`,
                                fontWeight: typography.secondary_font.weight,
                            }}
                            className="text-xl text-white/70 mt-8"
                        >
                            {selectedPair.preview_text.body}
                        </div>

                        <div className="text-sm text-white/40 mt-8 pt-8 border-t border-white/10">
                            <p>primary: {typography.primary_font.family} ({typography.primary_font.weight})</p>
                            <p>secondary: {typography.secondary_font.family} ({typography.secondary_font.weight})</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
