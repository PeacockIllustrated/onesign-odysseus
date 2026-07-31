import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { BEBAS, CC, withAlpha } from './theme';
import { ensureFonts } from './fonts';
import { Grain, Motes, Rule, Stage } from './ui/atoms';
import { Badge } from './ui/Badge';

export const SAVER_LOOP = 480; // 16s seamless loop @30fps

// Ambient words that slowly cycle beneath the mark — an artisan's quiet rota.
const WORDS = ['CRAFTED DAILY', 'FRESHLY BAKED', 'SINGLE ORIGIN', 'MADE TO ORDER'];

export const CraftCrumbScreensaver: React.FC = () => {
    ensureFonts();
    const frame = useCurrentFrame();
    const loop = SAVER_LOOP;
    const t = (frame % loop) / loop;

    // cycling word (each visible for a quarter loop, fading fully at each seam)
    const slot = loop / WORDS.length; // 120
    const idx = Math.floor((frame % loop) / slot) % WORDS.length;
    const local = (frame % loop) % slot;
    const wordOp = interpolate(local, [0, 22, slot - 22, slot], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

    // whole composition drifts up-down a hair (a slow breath on top of the badge's)
    const floatY = Math.sin(t * Math.PI * 2) * 8;

    return (
        <AbsoluteFill>
            <Stage loop={loop}>
                <Motes loop={loop} count={28} />
                <AbsoluteFill
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: `translateY(${floatY}px)`,
                    }}
                >
                    <Badge size={520} loop={loop} />

                    <div style={{ marginTop: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                        <Rule width={200} opacity={0.9} />
                        <div style={{ height: 42, display: 'flex', alignItems: 'center' }}>
                            <span
                                style={{
                                    fontFamily: BEBAS,
                                    fontSize: 34,
                                    letterSpacing: '0.42em',
                                    color: CC.cream,
                                    opacity: wordOp,
                                    textShadow: `0 0 24px ${withAlpha(CC.brown, 0.4)}`,
                                    // account for letter-spacing pushing text right
                                    paddingLeft: '0.42em',
                                }}
                            >
                                {WORDS[idx]}
                            </span>
                        </div>
                    </div>
                </AbsoluteFill>
            </Stage>
            <Grain opacity={0.045} />
        </AbsoluteFill>
    );
};
