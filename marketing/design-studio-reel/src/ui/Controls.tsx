import React from 'react';
import { BRAND, FONT } from '../theme';
import { ArrowRight, Check, Send, Shield, Sparkle, Upload } from './Icons';

/** A labelled numeric input (mm), with an optional focus highlight. */
export function NumberField({
    label,
    value,
    unit = 'mm',
    focus = false,
}: {
    label: string;
    value: number | string;
    unit?: string;
    focus?: boolean;
}) {
    return (
        <label style={{ display: 'block', flex: 1 }}>
            <span
                style={{
                    display: 'block',
                    marginBottom: 8,
                    fontFamily: FONT,
                    fontSize: 19,
                    fontWeight: 500,
                    color: '#71797d',
                }}
            >
                {label}
            </span>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: 62,
                    padding: '0 18px',
                    borderRadius: 14,
                    border: `2px solid ${focus ? BRAND.accent : '#d9dde0'}`,
                    background: focus ? '#f2f7f9' : '#fff',
                    boxShadow: focus ? `0 0 0 4px ${BRAND.accent}22` : 'none',
                    fontFamily: FONT,
                }}
            >
                <span
                    style={{
                        fontSize: 27,
                        fontWeight: 600,
                        color: '#1f262a',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {value}
                </span>
                <span style={{ fontSize: 19, color: '#a4abae' }}>{unit}</span>
            </div>
        </label>
    );
}

export function SizeFields({
    w,
    h,
    d,
    focus,
}: {
    w: number;
    h: number;
    d: number;
    focus?: 'w' | 'h' | 'd' | null;
}) {
    return (
        <div style={{ display: 'flex', gap: 14 }}>
            <NumberField label="Width" value={w} focus={focus === 'w'} />
            <NumberField label="Height" value={h} focus={focus === 'h'} />
            <NumberField label="Depth" value={d} focus={focus === 'd'} />
        </div>
    );
}

const RALS: Array<[string, string]> = [
    ['#c8cccd', 'Aluminium'],
    ['#1c1f22', 'Jet Black'],
    ['#3a5f6a', 'Teal'],
    ['#8a1f1f', 'Ruby'],
    ['#204a2b', 'Fir'],
    ['#e6e2d8', 'Cream'],
];

export function RalSwatches({ selected }: { selected: number }) {
    return (
        <div>
            <span
                style={{
                    display: 'block',
                    margin: '4px 0 12px',
                    fontFamily: FONT,
                    fontSize: 19,
                    fontWeight: 500,
                    color: '#71797d',
                }}
            >
                Panel colour (RAL)
            </span>
            <div style={{ display: 'flex', gap: 14 }}>
                {RALS.map(([hex, name], i) => {
                    const active = i === selected;
                    return (
                        <div
                            key={name}
                            style={{
                                width: 60,
                                height: 60,
                                borderRadius: 14,
                                background: hex,
                                boxShadow: active
                                    ? `0 0 0 3px #fff, 0 0 0 6px ${BRAND.accent}`
                                    : '0 0 0 1px rgba(0,0,0,0.12)',
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export function FoldToggles({ on }: { on: [boolean, boolean, boolean, boolean] }) {
    const labels = ['Top', 'Bottom', 'Left', 'Right'];
    return (
        <div>
            <span
                style={{
                    display: 'block',
                    margin: '4px 0 12px',
                    fontFamily: FONT,
                    fontSize: 19,
                    fontWeight: 500,
                    color: '#71797d',
                }}
            >
                Folded edges
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
                {labels.map((l, i) => (
                    <span
                        key={l}
                        style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '14px 0',
                            borderRadius: 12,
                            fontFamily: FONT,
                            fontSize: 20,
                            fontWeight: 600,
                            color: on[i] ? '#fff' : '#8b9296',
                            background: on[i] ? BRAND.accent : '#eef1f3',
                        }}
                    >
                        {l}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** The SVG dropzone. `focus` flashes the teal ring; `filename` shows the chip. */
export function Dropzone({
    focus = false,
    dropped = false,
}: {
    focus?: boolean;
    dropped?: boolean;
}) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                minHeight: 190,
                borderRadius: 20,
                border: `3px dashed ${focus ? BRAND.accent : '#c9d3d7'}`,
                background: focus ? '#eef5f7' : '#f6f8f9',
                boxShadow: focus ? `0 0 0 5px ${BRAND.accent}22` : 'none',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 60,
                    height: 60,
                    borderRadius: 999,
                    background: dropped ? BRAND.accent : '#e2e8ea',
                }}
            >
                {dropped ? (
                    <Check size={30} color="#fff" />
                ) : (
                    <Upload size={28} color="#6b7377" />
                )}
            </div>
            <span
                style={{
                    fontFamily: FONT,
                    fontSize: 23,
                    fontWeight: 600,
                    color: '#4a5155',
                }}
            >
                {dropped ? 'logo.svg added' : 'Drop your logo — SVG'}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 18, color: '#9aa1a5' }}>
                Cut it in · stand it off · mix materials
            </span>
        </div>
    );
}

/** A file chip that flies in and drops on the zone. */
export function FileChip({ label = 'logo.svg' }: { label?: string }) {
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                borderRadius: 14,
                background: '#fff',
                boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
                border: '1px solid rgba(0,0,0,0.06)',
                fontFamily: FONT,
                fontSize: 22,
                fontWeight: 600,
                color: '#33393d',
            }}
        >
            <span
                style={{
                    display: 'flex',
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: BRAND.light,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Upload size={20} color={BRAND.accentDark} />
            </span>
            {label}
        </div>
    );
}

export function BuiltUpRow({ highlight = false }: { highlight?: boolean }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '18px 20px',
                borderRadius: 16,
                border: `2px solid ${highlight ? BRAND.accent : '#cfe0e6'}`,
                background: '#e8f0f3',
                boxShadow: highlight ? `0 0 0 5px ${BRAND.accent}22` : 'none',
            }}
        >
            <span
                style={{
                    display: 'flex',
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    background: BRAND.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Sparkle size={24} color="#fff" />
            </span>
            <span style={{ flex: 1 }}>
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontFamily: FONT,
                        fontSize: 23,
                        fontWeight: 700,
                        color: BRAND.accentDark,
                    }}
                >
                    Built-up lettering
                    <span
                        style={{
                            padding: '3px 10px',
                            borderRadius: 999,
                            background: '#fff',
                            fontSize: 15,
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: BRAND.accentDark,
                        }}
                    >
                        Premium
                    </span>
                </span>
                <span
                    style={{
                        display: 'block',
                        marginTop: 4,
                        fontFamily: FONT,
                        fontSize: 19,
                        color: 'rgba(58,95,106,0.8)',
                    }}
                >
                    Fabricated metal letters with real depth.
                </span>
            </span>
            <ArrowRight size={24} color={BRAND.accent} />
        </div>
    );
}

const GLOW_PRESETS: Array<[string, string]> = [
    ['#ffffff', 'White'],
    ['#ffd9a0', 'Warm'],
    ['#9ed0dc', 'Ice'],
    ['#ff5d5d', 'Red'],
    ['#5db4ff', 'Blue'],
    ['#7CFC8A', 'Green'],
];

export function GlowControls({
    selected,
    intensity,
}: {
    selected: number;
    intensity: number; // 0..1 for the slider fill
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 20px',
                    borderRadius: 14,
                    background: '#11171b',
                }}
            >
                <span
                    style={{
                        fontFamily: FONT,
                        fontSize: 22,
                        fontWeight: 500,
                        color: 'rgba(255,255,255,0.85)',
                    }}
                >
                    Edge / keyline glow
                </span>
                <span
                    style={{
                        position: 'relative',
                        width: 68,
                        height: 38,
                        borderRadius: 999,
                        background: BRAND.accent,
                    }}
                >
                    <span
                        style={{
                            position: 'absolute',
                            top: 4,
                            left: 34,
                            width: 30,
                            height: 30,
                            borderRadius: 999,
                            background: '#fff',
                        }}
                    />
                </span>
            </div>
            <div>
                <span
                    style={{
                        display: 'block',
                        marginBottom: 12,
                        fontFamily: FONT,
                        fontSize: 19,
                        fontWeight: 500,
                        color: '#71797d',
                    }}
                >
                    Glow colour
                </span>
                <div style={{ display: 'flex', gap: 16 }}>
                    {GLOW_PRESETS.map(([hex, name], i) => {
                        const active = i === selected;
                        return (
                            <div
                                key={name}
                                style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: 999,
                                    background: hex,
                                    boxShadow: active
                                        ? `0 0 0 3px ${BRAND.accent}, 0 0 18px ${hex}`
                                        : '0 0 0 1px rgba(0,0,0,0.12)',
                                }}
                            />
                        );
                    })}
                </div>
            </div>
            <div>
                <span
                    style={{
                        display: 'block',
                        marginBottom: 12,
                        fontFamily: FONT,
                        fontSize: 19,
                        fontWeight: 500,
                        color: '#71797d',
                    }}
                >
                    Intensity
                </span>
                <div
                    style={{
                        position: 'relative',
                        height: 10,
                        borderRadius: 999,
                        background: '#e2e8ea',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${intensity * 100}%`,
                            borderRadius: 999,
                            background: BRAND.accent,
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: `${intensity * 100}%`,
                            width: 30,
                            height: 30,
                            borderRadius: 999,
                            background: '#fff',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            transform: 'translate(-50%,-50%)',
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export function ContactForm({
    name,
    email,
    nameValid = false,
    emailValid = false,
}: {
    name: string;
    email: string;
    nameValid?: boolean;
    emailValid?: boolean;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <TextField label="Your name" required value={name} valid={nameValid} />
            <TextField label="Email" required value={email} valid={emailValid} />
            <div style={{ display: 'flex', gap: 14 }}>
                <TextField label="Phone" optional value="" flex />
                <TextField label="Postcode" optional value="" flex />
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 4,
                }}
            >
                <Shield size={22} color={BRAND.accent} />
                <span
                    style={{
                        fontFamily: FONT,
                        fontSize: 20,
                        fontWeight: 500,
                        color: '#5a6266',
                    }}
                >
                    Free, no-obligation quote — reply within 1 working day.
                </span>
            </div>
        </div>
    );
}

function TextField({
    label,
    value,
    required = false,
    optional = false,
    valid = false,
    flex = false,
}: {
    label: string;
    value: string;
    required?: boolean;
    optional?: boolean;
    valid?: boolean;
    flex?: boolean;
}) {
    return (
        <label style={{ display: 'block', flex: flex ? 1 : undefined }}>
            <span
                style={{
                    display: 'block',
                    marginBottom: 8,
                    fontFamily: FONT,
                    fontSize: 19,
                    fontWeight: 500,
                    color: '#71797d',
                }}
            >
                {label}
                {required && <span style={{ color: '#ef4444' }}> *</span>}
                {optional && <span style={{ color: '#a4abae' }}> (optional)</span>}
            </span>
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 62,
                    padding: '0 18px',
                    borderRadius: 14,
                    border: `2px solid ${valid ? '#34d399' : '#d9dde0'}`,
                    background: '#fff',
                    fontFamily: FONT,
                    fontSize: 24,
                    color: value ? '#1f262a' : '#b3b9bc',
                }}
            >
                {value || ' '}
                {valid && (
                    <span style={{ position: 'absolute', right: 16 }}>
                        <Check size={22} color="#34d399" />
                    </span>
                )}
            </div>
        </label>
    );
}

export { GLOW_PRESETS, RALS };
