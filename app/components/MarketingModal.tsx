'use client';

import { useEffect, useState } from 'react';

/**
 * Three-stage modal shown after a pure artwork approval. Copy is locked.
 *
 *   ack (auto ~1.8s) → marketing (Register Interest) → welcome (Learn More / Close)
 *
 * No backend yet — Register Interest just advances the stage. Learn More is a
 * stub for the upcoming PDF brochure.
 */

type Stage = 'ack' | 'marketing' | 'welcome';

interface Props {
    onClose: () => void;
}

const TEAL = '#4e7e8c';
const TEAL_DARK = '#3a5f6a';
const TEAL_LIGHT = '#e8f0f3';
const INK = '#1a1f23';

const KEYFRAMES = `
@keyframes osdFadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes osdCardIn {
    from { opacity: 0; transform: translateY(12px) scale(0.97) }
    to   { opacity: 1; transform: translateY(0)    scale(1)    }
}
@keyframes osdTickDraw { to { stroke-dashoffset: 0 } }
@keyframes osdMarkPop {
    0%   { opacity: 0; transform: scale(0.7) }
    60%  { opacity: 1; transform: scale(1.05) }
    100% { opacity: 1; transform: scale(1) }
}
`;

const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: 'rgba(26, 31, 35, 0.68)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    animation: 'osdFadeIn 200ms ease-out',
    fontFamily: "'Gilroy', 'Inter', system-ui, -apple-system, sans-serif",
};

const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: '14px',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 24px 60px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.10)',
    position: 'relative',
    animation: 'osdCardIn 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
};

export default function MarketingModal({ onClose }: Props) {
    const [stage, setStage] = useState<Stage>('ack');

    // ack auto-advances
    useEffect(() => {
        if (stage !== 'ack') return;
        const t = setTimeout(() => setStage('marketing'), 1800);
        return () => clearTimeout(t);
    }, [stage]);

    // Esc dismisses post-ack stages
    useEffect(() => {
        if (stage === 'ack') return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [stage, onClose]);

    return (
        <>
            <style>{KEYFRAMES}</style>
            <div
                style={backdropStyle}
                role="dialog"
                aria-modal="true"
                aria-label="Onesign and Digital Services"
            >
                {stage === 'ack' && <AckCard />}
                {stage === 'marketing' && (
                    <MarketingCard
                        onRegister={() => setStage('welcome')}
                        onClose={onClose}
                    />
                )}
                {stage === 'welcome' && <WelcomeCard onClose={onClose} />}
            </div>
        </>
    );
}

function AckCard() {
    return (
        <div style={{ ...cardStyle, padding: '40px 32px', textAlign: 'center' }}>
            <div style={{
                width: '68px',
                height: '68px',
                margin: '0 auto',
                background: TEAL_LIGHT,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'osdMarkPop 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                    <path
                        d="M8 18.5 L15 25 L28 11"
                        stroke={TEAL_DARK}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            strokeDasharray: 40,
                            strokeDashoffset: 40,
                            animation: 'osdTickDraw 420ms 180ms cubic-bezier(0.65, 0, 0.35, 1) forwards',
                        }}
                    />
                </svg>
            </div>
            <h2 style={{
                fontSize: '22px',
                fontWeight: 700,
                color: INK,
                margin: '20px 0 6px 0',
                letterSpacing: '-0.015em',
            }}>Approval received</h2>
            <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
                Thanks &mdash; we&rsquo;re on it.
            </p>
        </div>
    );
}

function CloseX({ onClose }: { onClose: () => void }) {
    return (
        <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '32px',
                height: '32px',
                background: 'transparent',
                border: 'none',
                borderRadius: '50%',
                color: '#999',
                fontSize: '22px',
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
                e.currentTarget.style.color = '#333';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#999';
            }}
        >
            &times;
        </button>
    );
}

function MarketingCard({
    onRegister,
    onClose,
}: {
    onRegister: () => void;
    onClose: () => void;
}) {
    return (
        <div style={{ ...cardStyle, padding: '40px 32px 32px 32px' }}>
            <CloseX onClose={onClose} />

            <div style={{
                fontSize: '10px',
                fontWeight: 700,
                color: TEAL,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                marginBottom: '14px',
            }}>
                Onesign &amp; Digital Services
            </div>

            <h2 style={{
                fontSize: '26px',
                fontWeight: 700,
                color: INK,
                margin: '0 0 18px 0',
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
            }}>
                Still paying monthly for software that nearly fits?
            </h2>

            <div style={{
                display: 'inline-block',
                fontSize: '13px',
                fontWeight: 600,
                color: TEAL_DARK,
                background: TEAL_LIGHT,
                padding: '6px 12px',
                borderRadius: '999px',
                marginBottom: '26px',
                letterSpacing: '0.01em',
            }}>
                Built for you. Owned by you.
            </div>

            <button
                type="button"
                onClick={onRegister}
                style={{
                    width: '100%',
                    padding: '14px 20px',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#fff',
                    background: TEAL,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background 150ms',
                    letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TEAL_DARK; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = TEAL; }}
            >
                Register Interest
            </button>
        </div>
    );
}

function WelcomeCard({ onClose }: { onClose: () => void }) {
    // TODO: when the Onesign & Digital Services PDF brochure lands in /public,
    // wire Learn More to open it in a new tab and log the event.
    const handleLearnMore = () => {
        onClose();
    };

    return (
        <div style={{
            ...cardStyle,
            padding: '40px 32px 28px 32px',
            textAlign: 'center',
        }}>
            <div style={{
                width: '72px',
                height: '72px',
                margin: '0 auto 20px auto',
                background: INK,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'osdMarkPop 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}>
                <div
                    aria-hidden="true"
                    style={{
                        width: '40px',
                        height: '40px',
                        background: '#fff',
                        WebkitMaskImage: 'url(/Onesign-Logo-Black.svg)',
                        maskImage: 'url(/Onesign-Logo-Black.svg)',
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                    }}
                />
            </div>

            <h2 style={{
                fontSize: '24px',
                fontWeight: 700,
                color: INK,
                margin: '0 0 14px 0',
                letterSpacing: '-0.02em',
            }}>
                Welcome aboard.
            </h2>

            <p style={{
                fontSize: '14px',
                color: '#555',
                margin: '0 0 12px 0',
                lineHeight: 1.55,
            }}>
                We&rsquo;ll be in touch as new software rolls out &mdash; each tool
                designed to take a task that currently eats half a day and give you
                the afternoon back.
            </p>
            <p style={{
                fontSize: '14px',
                color: '#555',
                margin: '0 0 26px 0',
                lineHeight: 1.55,
            }}>
                In the meantime, if there&rsquo;s a job eating your team&rsquo;s
                week, we&rsquo;d love to hear about it. Just reach out.
            </p>

            <button
                type="button"
                onClick={handleLearnMore}
                style={{
                    width: '100%',
                    padding: '13px 20px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#fff',
                    background: TEAL,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '8px',
                    transition: 'background 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TEAL_DARK; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = TEAL; }}
            >
                Learn More
            </button>

            <button
                type="button"
                onClick={onClose}
                style={{
                    width: '100%',
                    padding: '11px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#888',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                }}
            >
                Close
            </button>
        </div>
    );
}
