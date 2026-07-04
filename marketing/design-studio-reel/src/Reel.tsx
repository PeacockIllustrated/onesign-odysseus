import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import {
    Scene1,
    Scene2,
    Scene3,
    Scene4,
    Scene5,
    Scene6,
    Scene7,
    Scene8,
    Scene9,
    Scene10,
    Scene11,
} from './scenes';
import { Grain } from './ui/Fx';
import { ensureFonts } from './fonts';

// [startFrame, durationFrames] — the viral cut, tiles 0→1020 (34s @ 30fps).
const TL: Array<[React.FC<{ start: number }>, number, number]> = [
    [Scene1, 0, 60], // HOOK — result first
    [Scene2, 60, 45], // PIVOT — rewind to blank
    [Scene3, 105, 120], // SIZE
    [Scene4, 225, 120], // ARTWORK
    [Scene5, 345, 105], // LIGHT — presets rip
    [Scene6, 450, 105], // GLOW — day→night
    [Scene7, 555, 90], // SEND + proof
    [Scene8, 645, 30], // MONTAGE STINGER
    [Scene9, 675, 192], // REAL-BRAND MONTAGE (6×32)
    [Scene10, 867, 45], // SOCIAL-PROOF LINE
    [Scene11, 912, 108], // CTA
];

export const TOTAL_FRAMES = 1020;

export const DesignStudioReel: React.FC = () => {
    ensureFonts(); // register bundled display fonts once, within render scope
    return (
        <AbsoluteFill style={{ background: '#04070a' }}>
            {TL.map(([Comp, from, dur], i) => (
                <Sequence key={i} from={from} durationInFrames={dur}>
                    <Comp start={from} />
                </Sequence>
            ))}
            {/* film grain only — the disliked full-frame pulse is gone. */}
            <Grain opacity={0.045} />
        </AbsoluteFill>
    );
};
