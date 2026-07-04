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
} from './scenes';
import { BeatPulse, EntryFlash, Grain, ScanSweep } from './ui/Fx';

// [startFrame, durationFrames] — tiles 0→1140 (38s @ 30fps) with no gaps.
const TL: Array<[React.FC<{ start: number }>, number, number]> = [
    [Scene1, 0, 105],
    [Scene2, 105, 105],
    [Scene3, 210, 120],
    [Scene4, 330, 120],
    [Scene5, 450, 135],
    [Scene6, 585, 105],
    [Scene7, 690, 150],
    [Scene8, 840, 105],
    [Scene9, 945, 105],
    [Scene10, 1050, 90],
];

export const TOTAL_FRAMES = 1140;

export const DesignStudioReel: React.FC = () => {
    return (
        <AbsoluteFill style={{ background: '#050a0d' }}>
            <BeatPulse>
                {TL.map(([Comp, from, dur], i) => (
                    <Sequence key={i} from={from} durationInFrames={dur}>
                        <Comp start={from} />
                    </Sequence>
                ))}
            </BeatPulse>
            {/* whip-flash on every scene cut (global frame, so `at` = scene start) */}
            {TL.slice(1).map(([, from], i) => (
                <EntryFlash key={`fl${i}`} at={from} dur={7} strength={0.55} />
            ))}
            {/* global energy layers, above the scenes */}
            <ScanSweep period={150} opacity={0.08} />
            <Grain opacity={0.05} />
        </AbsoluteFill>
    );
};
