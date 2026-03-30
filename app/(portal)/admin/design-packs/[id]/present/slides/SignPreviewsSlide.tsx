import { DesignPack } from '@/lib/design-packs/types';
import { SIGN_TEMPLATE_GENERATORS } from '@/lib/design-packs/sign-templates';
import { useState } from 'react';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function SignPreviewsSlide({ pack }: SlideProps) {
    const [currentType, setCurrentType] = useState<'entrance' | 'wayfinding'>('entrance');

    const hasDesignData = pack.data_json.typography && pack.data_json.colours;

    if (!hasDesignData) {
        return (
            <div className="h-full flex items-center justify-center p-12">
                <div className="text-center">
                    <h2 className="text-4xl font-bold mb-4">sign previews</h2>
                    <p className="text-white/60">complete design selections to see previews</p>
                </div>
            </div>
        );
    }

    const svg = SIGN_TEMPLATE_GENERATORS[currentType](pack.data_json, pack.project_name);

    return (
        <div className="h-full flex flex-col items-center justify-center p-12">
            <h2 className="text-3xl font-bold mb-12">sign previews</h2>

            <div className="max-w-5xl w-full">
                <div className="flex gap-4 mb-8 justify-center">
                    <button
                        onClick={() => setCurrentType('entrance')}
                        className={`px-4 py-2 rounded transition-colors ${
                            currentType === 'entrance'
                                ? 'bg-white text-black'
                                : 'bg-white/10 hover:bg-white/20'
                        }`}
                    >
                        entrance sign
                    </button>
                    <button
                        onClick={() => setCurrentType('wayfinding')}
                        className={`px-4 py-2 rounded transition-colors ${
                            currentType === 'wayfinding'
                                ? 'bg-white text-black'
                                : 'bg-white/10 hover:bg-white/20'
                        }`}
                    >
                        wayfinding
                    </button>
                </div>

                <div className="bg-neutral-100 rounded-lg p-8 flex items-center justify-center">
                    <div dangerouslySetInnerHTML={{ __html: svg }} />
                </div>

                <p className="text-center text-sm text-white/40 mt-6">
                    your design system applied to signage templates
                </p>
            </div>
        </div>
    );
}
