'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DesignPack } from '@/lib/design-packs/types';
import { lockSection } from '@/lib/design-packs/actions';
import { X, ChevronLeft, ChevronRight, Lock, Check } from 'lucide-react';
import { WelcomeSlide } from './slides/WelcomeSlide';
import { TypographySlide } from './slides/TypographySlide';
import { ColourSlide } from './slides/ColourSlide';
import { GraphicStyleSlide } from './slides/GraphicStyleSlide';
import { MaterialsSlide } from './slides/MaterialsSlide';
import { SignPreviewsSlide } from './slides/SignPreviewsSlide';
import { SummarySlide } from './slides/SummarySlide';

interface PresentationViewProps {
    pack: DesignPack;
}

const SLIDES = [
    { id: 'welcome', label: 'welcome', component: WelcomeSlide },
    { id: 'typography', label: 'typography', component: TypographySlide, lockable: true },
    { id: 'colours', label: 'colours', component: ColourSlide, lockable: true },
    { id: 'graphic-style', label: 'graphic style', component: GraphicStyleSlide, lockable: true },
    { id: 'materials', label: 'materials', component: MaterialsSlide, lockable: true },
    { id: 'sign-previews', label: 'sign previews', component: SignPreviewsSlide },
    { id: 'summary', label: 'summary', component: SummarySlide },
];

export function PresentationView({ pack }: PresentationViewProps) {
    const router = useRouter();
    const [currentSlide, setCurrentSlide] = useState(0);
    const [lockedSections, setLockedSections] = useState<Set<string>>(new Set());

    // Initialize locked sections from pack data
    useEffect(() => {
        const locked = new Set<string>();
        if (pack.data_json.typography?.locked) locked.add('typography');
        if (pack.data_json.colours?.locked) locked.add('colours');
        if (pack.data_json.graphic_style?.locked) locked.add('graphic-style');
        if (pack.data_json.materials?.locked) locked.add('materials');
        setLockedSections(locked);
    }, [pack.data_json]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    goToSlide(currentSlide + 1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    goToSlide(currentSlide - 1);
                    break;
                case 'Escape':
                    router.push(`/app/admin/design-packs/${pack.id}`);
                    break;
                case 'l':
                case 'L':
                    e.preventDefault();
                    handleLockSection();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSlide, pack.id, router]);

    const goToSlide = (index: number) => {
        if (index < 0 || index >= SLIDES.length) return;
        setCurrentSlide(index);
    };

    const handleLockSection = async () => {
        const slide = SLIDES[currentSlide];
        if (!slide.lockable) return;

        const sectionId = slide.id as 'typography' | 'colours' | 'graphic_style' | 'materials';
        const isLocked = lockedSections.has(slide.id);

        if (!isLocked) {
            await lockSection(pack.id, sectionId);
            setLockedSections((prev) => new Set(prev).add(slide.id));
        }
    };

    const CurrentSlideComponent = SLIDES[currentSlide].component;
    const currentSlideData = SLIDES[currentSlide];
    const isCurrentLocked = lockedSections.has(currentSlideData.id);

    // Calculate progress
    const totalLockable = SLIDES.filter((s) => s.lockable).length;
    const lockedCount = SLIDES.filter((s) => s.lockable && lockedSections.has(s.id)).length;
    const progressPercent = Math.round((lockedCount / totalLockable) * 100);

    return (
        <div className="fixed inset-0 bg-black text-white flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push(`/app/admin/design-packs/${pack.id}`)}
                        className="p-2 hover:bg-white/10 rounded transition-colors"
                        title="Exit presentation (ESC)"
                    >
                        <X size={20} />
                    </button>
                    <div>
                        <h1 className="text-sm font-medium">{pack.project_name}</h1>
                        <p className="text-xs text-white/60">{pack.client_name}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Progress */}
                    <div className="flex items-center gap-2">
                        <div className="w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <span className="text-xs text-white/60 tabular-nums">
                            {lockedCount}/{totalLockable}
                        </span>
                    </div>

                    {/* Lock Button */}
                    {currentSlideData.lockable && !isCurrentLocked && (
                        <button
                            onClick={handleLockSection}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm transition-colors"
                            title="Lock section (L)"
                        >
                            <Lock size={14} />
                            lock section
                        </button>
                    )}

                    {currentSlideData.lockable && isCurrentLocked && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded text-sm text-green-300">
                            <Check size={14} />
                            locked
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                <CurrentSlideComponent pack={pack} isLocked={isCurrentLocked} />
            </div>

            {/* Bottom Navigation */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
                <button
                    onClick={() => goToSlide(currentSlide - 1)}
                    disabled={currentSlide === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft size={16} />
                    previous
                </button>

                {/* Slide Indicators */}
                <div className="flex items-center gap-2">
                    {SLIDES.map((slide, idx) => (
                        <button
                            key={slide.id}
                            onClick={() => goToSlide(idx)}
                            className={`
                                w-2 h-2 rounded-full transition-all
                                ${idx === currentSlide ? 'bg-white w-8' : 'bg-white/30 hover:bg-white/50'}
                            `}
                            title={slide.label}
                        />
                    ))}
                </div>

                <button
                    onClick={() => goToSlide(currentSlide + 1)}
                    disabled={currentSlide === SLIDES.length - 1}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                    next
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Keyboard Hints (fade out after 5 seconds) */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur px-4 py-2 rounded text-xs text-white/60 pointer-events-none animate-fadeOut">
                ← → navigate • L lock • ESC exit
            </div>
        </div>
    );
}
