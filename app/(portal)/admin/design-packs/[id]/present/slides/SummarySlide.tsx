import { DesignPack } from '@/lib/design-packs/types';
import { Check, AlertTriangle } from 'lucide-react';

interface SlideProps {
    pack: DesignPack;
    isLocked?: boolean;
}

export function SummarySlide({ pack }: SlideProps) {
    const sections = [
        { id: 'typography', label: 'typography', completed: !!pack.data_json.typography?.locked },
        { id: 'colours', label: 'colour palette', completed: !!pack.data_json.colours?.locked },
        { id: 'graphic_style', label: 'graphic style', completed: !!pack.data_json.graphic_style?.locked },
        { id: 'materials', label: 'materials & finishes', completed: !!pack.data_json.materials?.locked },
    ];

    const completedCount = sections.filter((s) => s.completed).length;
    const totalCount = sections.length;
    const allComplete = completedCount === totalCount;

    const parkedDecisions = pack.data_json.parked_decisions || [];

    return (
        <div className="h-full flex flex-col items-center justify-center p-12">
            <h2 className="text-3xl font-bold mb-12">session summary</h2>

            <div className="max-w-2xl w-full space-y-8">
                {/* Progress Summary */}
                <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                    <h3 className="text-xl font-medium mb-4">design pack progress</h3>
                    <div className="space-y-3">
                        {sections.map((section) => (
                            <div key={section.id} className="flex items-center justify-between">
                                <span className="text-white/80">{section.label}</span>
                                {section.completed ? (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <Check size={16} />
                                        <span className="text-sm">locked</span>
                                    </div>
                                ) : (
                                    <span className="text-sm text-white/40">pending</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Parked Decisions */}
                {parkedDecisions.length > 0 && (
                    <div className="bg-amber-500/10 rounded-lg p-6 border border-amber-500/20">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle size={20} className="text-amber-400" />
                            <h3 className="text-xl font-medium text-amber-400">parked decisions</h3>
                        </div>
                        <ul className="space-y-2 text-sm">
                            {parkedDecisions.map((decision, idx) => (
                                <li key={idx} className="text-white/70">
                                    <span className="font-medium">{decision.section}:</span> {decision.reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Next Steps */}
                <div className="text-center pt-8">
                    {allComplete && parkedDecisions.length === 0 ? (
                        <>
                            <Check size={48} className="mx-auto mb-4 text-green-400" />
                            <p className="text-2xl font-medium text-green-400 mb-2">design pack complete!</p>
                            <p className="text-white/60">
                                ready to export final document
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-xl font-medium mb-2">
                                {completedCount} of {totalCount} sections locked
                            </p>
                            <p className="text-white/60 text-sm">
                                {!allComplete && 'complete remaining sections to finalize design pack'}
                                {allComplete && parkedDecisions.length > 0 && 'resolve parked decisions to complete'}
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
