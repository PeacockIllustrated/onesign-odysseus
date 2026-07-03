import React from 'react';
import { Composition } from 'remotion';
import { DesignStudioReel, TOTAL_FRAMES } from './Reel';
import { FPS, HEIGHT, WIDTH } from './theme';

export const RemotionRoot: React.FC = () => {
    return (
        <Composition
            id="DesignStudioReel"
            component={DesignStudioReel}
            durationInFrames={TOTAL_FRAMES}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
        />
    );
};
