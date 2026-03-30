'use client';

interface WizardProgressProps {
    currentStep: number;
    totalSteps: number;
    stepLabels: string[];
}

export function WizardProgress({ currentStep, totalSteps, stepLabels }: WizardProgressProps) {
    return (
        <div className="mb-8">
            {/* Progress bar */}
            <div className="h-1 bg-neutral-100 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-black transition-all duration-300 ease-out"
                    style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                />
            </div>

            {/* Step indicators */}
            <div className="flex justify-between">
                {stepLabels.map((label, index) => (
                    <div
                        key={index}
                        className={`flex flex-col items-center ${index === currentStep
                            ? 'text-black'
                            : index < currentStep
                                ? 'text-neutral-400'
                                : 'text-neutral-300'
                            }`}
                    >
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-1 transition-all ${index === currentStep
                                ? 'bg-black text-white'
                                : index < currentStep
                                    ? 'bg-neutral-200 text-neutral-600'
                                    : 'bg-neutral-100 text-neutral-400'
                                }`}
                        >
                            {index < currentStep ? '✓' : index + 1}
                        </div>
                        <span className="text-xs hidden md:block">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
