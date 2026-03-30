'use client';

import { UseFormRegister, UseFormWatch } from 'react-hook-form';
import { ArchitectEnquiryFormData, PROJECT_TYPES, RIBA_STAGES } from '../schema';

interface StepProjectProps {
    register: UseFormRegister<ArchitectEnquiryFormData>;
    watch: UseFormWatch<ArchitectEnquiryFormData>;
}

export function StepProject({ register, watch }: StepProjectProps) {
    const planningSensitive = watch('planning_sensitive');

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">
                    About the project
                </h2>
                <p className="text-neutral-600">
                    Share details about the project you&apos;re working on. All fields are optional.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Project name
                    </label>
                    <input
                        {...register('project_name')}
                        type="text"
                        placeholder="Riverside Campus, Civic Centre, etc."
                        className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Project type
                    </label>
                    <select
                        {...register('project_type')}
                        className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300 bg-white appearance-none cursor-pointer"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                            backgroundPosition: 'right 0.75rem center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '1.5em 1.5em',
                            paddingRight: '2.5rem'
                        }}
                    >
                        <option value="">Select type...</option>
                        {PROJECT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                                {type.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        RIBA Stage
                    </label>
                    <select
                        {...register('riba_stage')}
                        className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300 bg-white appearance-none cursor-pointer"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                            backgroundPosition: 'right 0.75rem center',
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '1.5em 1.5em',
                            paddingRight: '2.5rem'
                        }}
                    >
                        <option value="">Select stage...</option>
                        {RIBA_STAGES.map((stage) => (
                            <option key={stage.value} value={stage.value}>
                                {stage.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Location
                    </label>
                    <input
                        {...register('location')}
                        type="text"
                        placeholder="London, Manchester, Edinburgh..."
                        className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300"
                    />
                </div>

                <div className="md:col-span-2">
                    <label
                        className={`flex items-center gap-4 p-4 rounded-[var(--radius-md)] border cursor-pointer transition-all duration-300 ${planningSensitive
                                ? 'border-neutral-900 bg-neutral-50'
                                : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                    >
                        <input
                            type="checkbox"
                            {...register('planning_sensitive')}
                            className="sr-only"
                        />
                        <span className={`shrink-0 w-6 h-6 border-2 rounded flex items-center justify-center transition-all duration-200 ${planningSensitive
                                ? 'border-black bg-black'
                                : 'border-neutral-300'
                            }`}>
                            {planningSensitive && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </span>
                        <div>
                            <span className="text-sm font-medium text-neutral-900">Sensitive context</span>
                            <p className="text-sm text-neutral-500">Conservation area, listed building, or planning-sensitive site</p>
                        </div>
                    </label>
                </div>
            </div>
        </div>
    );
}
