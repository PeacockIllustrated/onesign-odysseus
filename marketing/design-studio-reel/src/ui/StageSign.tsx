import { ArtKind, GlowSpec, SignPanel } from './SignPanel';

/** px per mm — chosen so the default 2400mm sign sits ~770px wide and a
 *  resize to 3000mm still fits the 1080 canvas with margins. */
export const K = 0.32;

/**
 * Places the live sign on the stage with the shared, continuous idle rotation
 * (studioIdle: 4° sine, 6s period) so the sign is "always alive" across every
 * scene. `absFrame` is the absolute timeline frame (local frame + scene start)
 * so the idle never jumps at a cut.
 */
export function StageSign({
    absFrame,
    wMm,
    hMm,
    dMm,
    color,
    night = false,
    glow = { on: false, color: '#ffffff', intensity: 1 },
    art = 'none',
    artwork,
    rotYBase = -24,
    rotX = 9,
    fold = 1,
    centerY = 540,
    extraScale = 1,
}: {
    absFrame: number;
    wMm: number;
    hMm: number;
    dMm: number;
    color: string;
    night?: boolean;
    glow?: GlowSpec;
    art?: ArtKind;
    artwork?: React.ReactNode;
    rotYBase?: number;
    rotX?: number;
    fold?: number;
    centerY?: number;
    extraScale?: number;
}) {
    // A livelier idle: a bigger primary sway plus a faster secondary wobble,
    // and a gentle breathing scale — so the sign never sits still.
    const idle =
        6.5 * Math.sin((2 * Math.PI * absFrame) / 150) +
        1.5 * Math.sin((2 * Math.PI * absFrame) / 47);
    const breathe = 1 + 0.012 * Math.sin((2 * Math.PI * absFrame) / 96);
    const widthPx = wMm * K;
    const heightPx = hMm * K;
    const depthPx = Math.max(20, dMm * 0.52);

    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: centerY,
                display: 'flex',
                justifyContent: 'center',
                transform: 'translateY(-50%)',
            }}
        >
            <SignPanel
                widthPx={widthPx}
                heightPx={heightPx}
                depthPx={depthPx}
                color={color}
                rotY={rotYBase + idle}
                rotX={rotX}
                fold={fold}
                night={night}
                glow={glow}
                art={art}
                artwork={artwork}
                scale={extraScale * breathe}
            />
        </div>
    );
}
