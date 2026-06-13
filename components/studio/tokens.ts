// components/studio/tokens.ts
//
// Shared visual language for the Onesign Studio — the cinematic, award-worthy
// skin that ties every design & fabrication tool together. One source of truth
// for the colours and the dark "stage" backdrop so the hub, the visualiser
// concept and any future tool surface stay in lock-step.

export const STUDIO = {
    /** Brand steel teal. */
    accent: '#4e7e8c',
    accentDark: '#3a5f6a',
    /** Brightened teal — the brand accent reads muddy on a near-black stage,
     *  so HUD glints / active states / glows on the dark surfaces use this. */
    accentGlow: '#9ed0dc',
    light: '#e8f0f3',
    /** Ink used on top of an accent-filled chip. */
    onAccent: '#0c1114',
} as const;

/**
 * The cinematic stage backdrop. `night` swaps the daylight steel gradient for
 * a deep near-black so an illuminated sign can glow — the marquee day/night
 * beat the visualiser concert leans on.
 */
export function stageBackground(night: boolean): string {
    return night
        ? 'radial-gradient(120% 90% at 50% 0%, #0a1014 0%, #04070a 60%, #020405 100%)'
        : 'radial-gradient(120% 90% at 50% 0%, #1a242a 0%, #0d1418 55%, #080c0f 100%)';
}
