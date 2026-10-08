'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Number inputs that never fight the person typing.
 *
 * The field keeps its own text while focused, so deleting a digit or typing
 * "1." does not snap back, and only commits a parsed, non-negative number.
 * A negative value is refused at the keyboard rather than priced — the
 * original tool happily quoted a sign at −£561 because a return depth went in
 * as −50, the way the old spreadsheet needed it.
 */
export function NumberInput({
    value,
    onChange,
    step = 1,
    integer = false,
    max,
    placeholder,
    allowEmpty = false,
    className = '',
    id,
    ariaLabel,
}: {
    value: number | null;
    onChange: (v: number | null) => void;
    step?: number;
    integer?: boolean;
    max?: number;
    placeholder?: string;
    /** Empty commits null instead of 0 (used for "book default" overrides). */
    allowEmpty?: boolean;
    className?: string;
    id?: string;
    ariaLabel?: string;
}) {
    // While focused the field shows exactly what was typed (so "1." or a
    // half-deleted number does not snap back); otherwise it shows the value.
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? (value === null ? '' : String(value));

    const commit = (raw: string) => {
        if (raw.trim() === '') {
            onChange(allowEmpty ? null : 0);
            return;
        }
        let n = Number(raw);
        if (!Number.isFinite(n)) return;
        n = Math.max(0, n);
        if (integer) n = Math.floor(n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
    };

    return (
        <input
            id={id}
            aria-label={ariaLabel}
            type="number"
            inputMode="decimal"
            min={0}
            max={max}
            step={step}
            placeholder={placeholder}
            className={`calc-input ${className}`}
            value={shown}
            onFocus={() => setDraft(shown)}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
                const raw = e.target.value;
                if (raw.startsWith('-')) return;
                setDraft(raw);
                commit(raw);
            }}
        />
    );
}

/** Pounds on screen, pence in the data. */
export function MoneyInput({
    pence,
    onChange,
    className = '',
    ariaLabel,
}: {
    pence: number;
    onChange: (pence: number) => void;
    className?: string;
    ariaLabel?: string;
}) {
    return (
        <NumberInput
            ariaLabel={ariaLabel}
            className={className}
            step={0.01}
            value={Math.round(pence) / 100}
            onChange={(v) => onChange(Math.round((v ?? 0) * 100))}
        />
    );
}

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
    return (
        <label className="calc-field" htmlFor={htmlFor}>
            <span>{label}</span>
            {children}
        </label>
    );
}

/**
 * A destructive button that asks on the page, not with window.confirm.
 *
 * A browser told to "prevent this page from creating additional dialogs"
 * answers every confirm() with false without showing anything, and the
 * button it guarded just stops working. The first press here turns the
 * button into "Remove? Yes / No" in place.
 */
export function ConfirmButton({
    children,
    question = 'Remove?',
    yes = 'Yes, remove',
    onConfirm,
    className = 'btn-secondary',
    style,
    ariaLabel,
    disabled,
}: {
    children: ReactNode;
    question?: string;
    yes?: string;
    onConfirm: () => void;
    className?: string;
    style?: CSSProperties;
    ariaLabel?: string;
    disabled?: boolean;
}) {
    const [asking, setAsking] = useState(false);
    if (asking) {
        return (
            <span className="calc-confirm" role="group" aria-label={question}>
                <span>{question}</span>
                <button
                    type="button"
                    className="calc-confirm-yes"
                    onClick={() => {
                        setAsking(false);
                        onConfirm();
                    }}
                >
                    {yes}
                </button>
                <button type="button" className="calc-confirm-no" onClick={() => setAsking(false)}>
                    No
                </button>
            </span>
        );
    }
    return (
        <button type="button" className={className} style={style} aria-label={ariaLabel} disabled={disabled} onClick={() => setAsking(true)}>
            {children}
        </button>
    );
}
