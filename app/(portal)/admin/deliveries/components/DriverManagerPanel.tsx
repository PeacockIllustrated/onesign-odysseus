'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Loader2, Truck } from 'lucide-react';
import { createDriver, toggleDriverActive } from '@/lib/drivers/actions';
import type { Driver } from '@/lib/drivers/types';

interface Props {
    drivers: Driver[];
    open: boolean;
    onClose: () => void;
}

export function DriverManagerPanel({ drivers, open, onClose }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showAdd, setShowAdd] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [postcode, setPostcode] = useState('');
    const [vehicleType, setVehicleType] = useState('van');
    const [error, setError] = useState<string | null>(null);

    const handleCreate = () => {
        if (!name.trim()) { setError('name required'); return; }
        setError(null);
        startTransition(async () => {
            const res = await createDriver({
                name: name.trim(),
                phone: phone.trim() || undefined,
                home_postcode: postcode.trim() || undefined,
                vehicle_type: vehicleType as any,
            });
            if (!res.ok) { setError(res.error); return; }
            setName(''); setPhone(''); setPostcode(''); setShowAdd(false);
            router.refresh();
        });
    };

    const handleToggle = (id: string) => {
        startTransition(async () => {
            await toggleDriverActive(id);
            router.refresh();
        });
    };

    if (!open) return null;

    const inputCls = 'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
            <div className="w-full max-w-md bg-white shadow-xl h-full overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Manage Drivers</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-black"><X size={20} /></button>
                </div>

                {drivers.map((d) => (
                    <div key={d.id} className={`flex items-center justify-between gap-3 p-3 rounded border ${d.is_active ? 'border-neutral-200' : 'border-neutral-100 opacity-50'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                            <Truck size={16} className="text-neutral-500 shrink-0" />
                            <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{d.name}</div>
                                {d.home_postcode && <div className="text-[11px] text-neutral-400">{d.home_postcode}</div>}
                            </div>
                        </div>
                        <button
                            onClick={() => handleToggle(d.id)}
                            disabled={pending}
                            className={`text-xs font-semibold px-2 py-1 rounded ${d.is_active ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}
                        >
                            {d.is_active ? 'active' : 'inactive'}
                        </button>
                    </div>
                ))}

                {showAdd ? (
                    <div className="space-y-2 border border-neutral-200 rounded p-3">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Driver name *" className={inputCls} />
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputCls} />
                        <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Home postcode" className={inputCls} />
                        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls}>
                            <option value="van">Van</option>
                            <option value="truck">Truck</option>
                            <option value="car">Car</option>
                        </select>
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <div className="flex gap-2">
                            <button onClick={handleCreate} disabled={pending} className="btn-primary flex-1 inline-flex items-center justify-center gap-1 text-sm">
                                {pending && <Loader2 size={14} className="animate-spin" />} add driver
                            </button>
                            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">cancel</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowAdd(true)} className="btn-secondary w-full inline-flex items-center justify-center gap-1 text-sm">
                        <Plus size={14} /> add driver
                    </button>
                )}
            </div>
        </div>
    );
}
