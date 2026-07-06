import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, WIDTH } from './theme';
import { CraftCrumbScreensaver, SAVER_LOOP } from './Screensaver';
import { CraftCrumbPromos, PROMOS_TOTAL } from './Promos';

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="CraftCrumbScreensaver"
                component={CraftCrumbScreensaver}
                durationInFrames={SAVER_LOOP}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
            <Composition
                id="CraftCrumbPromos"
                component={CraftCrumbPromos}
                durationInFrames={PROMOS_TOTAL}
                fps={FPS}
                width={WIDTH}
                height={HEIGHT}
            />
        </>
    );
};
