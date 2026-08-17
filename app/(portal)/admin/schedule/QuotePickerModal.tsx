'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Lane } from '@/lib/schedule/types';
import { createFittingJobFromQuote, getSchedulableQuotesAction } from '@/lib/schedule/actions';

interface Quote {
    id: string;
    quote_number: string;
    customer_name: string | null;
    project_name: string | null;
}

interface Props {
    lane: Lane;
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Accepted quotes with no fitting card yet.
 *
 * This is the whole of what the standalone brief called the ClarityGo
 * integration. Odysseus replaces ClarityGo, so there is no CSV to export and
 * de-duplicate on a quote-ref string — the quote is already here and the link
 * is a foreign key.
 */
export function QuotePickerModal({ lane, onClose, onSaved }: Props) {
    const [quotes, setQuotes] = useState<Quote[] | null>(null);
    const [filter, setFilter] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        let live = true;
        getSchedulableQuotesAction()
            .then((q) => {
                if (live) setQuotes(q);
            })
            .catch(() => {
                if (live) setError('could not load accepted quotes');
            });
        return () => {
            live = false;
        };
    }, []);

    const needle = filter.trim().toLowerCase();
    const shown = (quotes ?? []).filter(
        (q) =>
            !needle ||
            q.quote_number.toLowerCase().includes(needle) ||
            (q.customer_name ?? '').toLowerCase().includes(needle) ||
            (q.project_name ?? '').toLowerCase().includes(needle)
    );

    function pull(quoteId: string) {
        setError(null);
        startTransition(async () => {
            const res = await createFittingJobFromQuote(quoteId, lane);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            onSaved();
        });
    }

    return (
        <div
            className="sb-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="sb-modal" style={{ maxWidth: 520 }}>
                <div className="sb-mhead">
                    add from an accepted quote
                </div>
                <div style={{ padding: 20 }}>
                    <p className="sb-note">
                        Accepted quotes that don&rsquo;t have a fitting card yet. Pulling one
                        in carries its client, contact and site across, so the card is linked
                        rather than retyped.
                    </p>

                    <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="search by quote number, client or project…"
                    />

                    <div style={{ marginTop: 12, maxHeight: '46vh', overflowY: 'auto' }}>
                        {quotes === null && <p className="sb-note">loading…</p>}
                        {quotes !== null && shown.length === 0 && (
                            <p className="sb-note">
                                Nothing waiting — every accepted quote already has a card.
                            </p>
                        )}
                        {shown.map((q) => (
                            <div key={q.id} className="sb-fitterrow">
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 12 }}>
                                        {q.customer_name ?? 'Unnamed client'}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 10,
                                            fontFamily: 'var(--sb-mono)',
                                            color: 'var(--sb-faint)',
                                        }}
                                    >
                                        {q.quote_number}
                                        {q.project_name ? ` · ${q.project_name}` : ''}
                                    </div>
                                </div>
                                <button
                                    className="sb-btn"
                                    style={{ flexShrink: 0 }}
                                    disabled={pending}
                                    onClick={() => pull(q.id)}
                                >
                                    add
                                </button>
                            </div>
                        ))}
                    </div>

                    {error && <p className="sb-error">{error}</p>}
                </div>
                <div className="sb-mfoot">
                    <span className="sb-grow" />
                    <button className="sb-btn primary" onClick={onClose}>
                        done
                    </button>
                </div>
            </div>
        </div>
    );
}
