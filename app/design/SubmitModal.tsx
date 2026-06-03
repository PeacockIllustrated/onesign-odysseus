'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send, X } from 'lucide-react';
import type { PanelParams } from '@/lib/visualiser/types';
import { submitDesignRequest } from '@/lib/design-requests/actions';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

export interface DesignPayload {
    params: PanelParams;
    svgSource: string | null;
    signType: string;
    thumbnail: string | null;
}

/**
 * Contact-capture + submit dialog for the public studio. The customer's design
 * (PanelParams + flattened SVG + a face-on preview) is assembled by the caller
 * and handed in via `design`; this dialog adds their details and posts it to the
 * Onesign team as a lead. Includes a honeypot field for basic bot defence.
 */
export function SubmitModal({
    open,
    onClose,
    design,
}: {
    open: boolean;
    onClose: () => void;
    design: DesignPayload | null;
}) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [postcode, setPostcode] = useState('');
    const [notes, setNotes] = useState('');
    const [honeypot, setHoneypot] = useState(''); // bots fill this; humans don't
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reference, setReference] = useState<string | null>(null);

    // Transient state (errors / success / pending) resets naturally because the
    // caller mounts this dialog fresh each time it opens (see PublicActionBar).
    if (!open) return null;

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const canSubmit = name.trim().length > 0 && emailValid && !pending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || !design) return;
        setPending(true);
        setError(null);
        const res = await submitDesignRequest({
            customerName: name.trim(),
            customerEmail: email.trim(),
            customerPhone: phone.trim(),
            company: company.trim(),
            postcode: postcode.trim(),
            projectNotes: notes.trim(),
            signType: design.signType,
            params: design.params,
            svgSource: design.svgSource,
            thumbnail: design.thumbnail,
            companyWebsite: honeypot,
        });
        setPending(false);
        if (res.ok) setReference(res.data.reference);
        else setError(res.error);
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
                aria-hidden
            />
            <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div
                    className="flex items-center justify-between px-5 py-4"
                    style={{ background: ACCENT }}
                >
                    <h2 className="text-base font-bold text-white">
                        {reference ? 'Request sent' : 'Send your design to Onesign'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
                    >
                        <X size={18} aria-hidden />
                    </button>
                </div>

                {reference ? (
                    /* ---------- Success state ---------- */
                    <div className="px-6 py-8 text-center">
                        <CheckCircle2
                            size={48}
                            className="mx-auto"
                            style={{ color: ACCENT }}
                            aria-hidden
                        />
                        <h3 className="mt-3 text-lg font-bold text-neutral-900">
                            Thanks, {name.split(' ')[0] || 'there'}!
                        </h3>
                        <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600">
                            Your design is with our team. We&apos;ll be in touch
                            by email with a quote and next steps. Quote your
                            reference if you get in touch:
                        </p>
                        <p
                            className="mt-3 inline-block rounded-lg border border-dashed px-4 py-2 font-mono text-sm font-semibold"
                            style={{ borderColor: ACCENT, color: ACCENT_DARK }}
                        >
                            {reference}
                        </p>
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
                                style={{ background: ACCENT }}
                            >
                                Back to my design
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ---------- Form state ---------- */
                    <form onSubmit={handleSubmit} className="px-5 py-4">
                        {/* Design summary */}
                        {design && (
                            <div className="mb-4 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                                {design.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={design.thumbnail}
                                        alt="Your sign design"
                                        className="h-14 w-20 shrink-0 rounded object-contain"
                                    />
                                ) : null}
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-neutral-800">
                                        {design.params.name || 'Your sign'}
                                    </p>
                                    <p className="truncate text-xs text-neutral-500">
                                        {design.signType} ·{' '}
                                        {Math.round(design.params.panelWidthMm)}×
                                        {Math.round(design.params.panelHeightMm)}
                                        mm
                                    </p>
                                </div>
                            </div>
                        )}

                        <p className="mb-3 text-xs text-neutral-500">
                            Tell us where to send your quote. Fields marked
                            <span className="text-red-500"> *</span> are required.
                        </p>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field
                                label="Your name"
                                required
                                value={name}
                                onChange={setName}
                                autoComplete="name"
                            />
                            <Field
                                label="Email"
                                required
                                type="email"
                                value={email}
                                onChange={setEmail}
                                autoComplete="email"
                            />
                            <Field
                                label="Phone"
                                value={phone}
                                onChange={setPhone}
                                autoComplete="tel"
                            />
                            <Field
                                label="Company"
                                value={company}
                                onChange={setCompany}
                                autoComplete="organization"
                            />
                            <Field
                                label="Install postcode"
                                value={postcode}
                                onChange={setPostcode}
                                autoComplete="postal-code"
                            />
                        </div>

                        <label className="mt-3 block">
                            <span className="text-xs font-medium text-neutral-600">
                                Anything else we should know?
                            </span>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Timescales, quantity, where it's going, brand colours…"
                                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#4e7e8c] focus:ring-1 focus:ring-[#4e7e8c]"
                            />
                        </label>

                        {/* Honeypot — visually hidden, off-screen, not tabbable.
                            A real person never sees or fills this. */}
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute',
                                left: '-9999px',
                                width: 1,
                                height: 1,
                                overflow: 'hidden',
                            }}
                        >
                            <label>
                                Company website
                                <input
                                    type="text"
                                    tabIndex={-1}
                                    autoComplete="off"
                                    value={honeypot}
                                    onChange={(e) => setHoneypot(e.target.value)}
                                />
                            </label>
                        </div>

                        {error && (
                            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                                {error}
                            </p>
                        )}

                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                aria-busy={pending}
                                className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ background: ACCENT }}
                                onMouseEnter={(e) => {
                                    if (!e.currentTarget.disabled)
                                        e.currentTarget.style.background =
                                            ACCENT_DARK;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = ACCENT;
                                }}
                            >
                                {pending ? (
                                    <Loader2
                                        size={16}
                                        className="animate-spin"
                                        aria-hidden
                                    />
                                ) : (
                                    <Send size={16} aria-hidden />
                                )}
                                {pending ? 'Sending…' : 'Send my design'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    required,
    type = 'text',
    autoComplete,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
    type?: string;
    autoComplete?: string;
}) {
    return (
        <label className="block">
            <span className="text-xs font-medium text-neutral-600">
                {label}
                {required && <span className="text-red-500"> *</span>}
            </span>
            <input
                type={type}
                required={required}
                value={value}
                autoComplete={autoComplete}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#4e7e8c] focus:ring-1 focus:ring-[#4e7e8c]"
            />
        </label>
    );
}
