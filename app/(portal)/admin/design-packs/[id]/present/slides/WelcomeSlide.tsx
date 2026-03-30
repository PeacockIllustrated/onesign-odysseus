import { DesignPack } from '@/lib/design-packs/types';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function WelcomeSlide({ pack }: SlideProps) {
    return (
        <div className="h-full flex items-center justify-center p-12">
            <div className="text-center max-w-3xl">
                <h1 className="text-6xl font-bold mb-6">{pack.project_name}</h1>
                <p className="text-2xl text-white/60 mb-12">design pack presentation for {pack.client_name}</p>
                <div className="text-white/40 text-sm">
                    <p>press → or space to begin</p>
                </div>
            </div>
        </div>
    );
}
