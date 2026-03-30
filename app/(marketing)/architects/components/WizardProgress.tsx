'use client';

interface WizardProgressProps {
    currentStep: number;
    totalSteps: number;
    stepLabels: string[];
}

export function WizardProgress({ currentStep, totalSteps, stepLabels }: WizardProgressProps) {
    return (
        <div className="mb-10">
            {/* Progress bar */}
            <div className="h-1 bg-neutral-100 rounded-full overflow-hidden mb-6">
                <div
                    className="h-full bg-black transition-all duration-500 ease-out"
                    style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                />
            </div>

            {/* Step indicators */}
            <div className="hidden md:flex justify-between">
                {stepLabels.map((label, index) => (
                    <div
                        key={index}
                        className={`flex flex-col items-center transition-all duration-300 ${index === currentStep
                                ? 'text-black'
                                : index < currentStep
                                    ? 'text-neutral-400'
                                    : 'text-neutral-300'
                            }`}
                    >
                        <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium mb-2 transition-all duration-300 ${index === currentStep
                                    ? 'bg-black text-white scale-110 shadow-lg'
                                    : index < currentStep
                                        ? 'bg-neutral-200 text-neutral-600'
                                        : 'bg-neutral-100 text-neutral-400'
                                }`}
                        >
                            {index < currentStep ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                index + 1
                            )}
                        </div>
                        <span className="text-xs font-medium">{label}</span>
                    </div>
                ))}
            </div>

            {/* Mobile step indicator */}
            <div className="md:hidden flex items-center justify-center gap-2">
                <span className="text-sm font-medium text-neutral-900">Step {currentStep + 1}</span>
                <span className="text-sm text-neutral-400">of {totalSteps}</span>
                <span className="text-sm text-neutral-600">• {stepLabels[currentStep]}</span>
            </div>
        </div>
    );
}
