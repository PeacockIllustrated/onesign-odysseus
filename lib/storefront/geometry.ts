/**
 * Pure geometry builder: a `StorefrontSpec` → `StorefrontBlock[]`.
 *
 * Derives every block from the spec's measured mm dimensions — back wall,
 * fascia surround + illuminated keyline + recessed sign mount, jamb, pilaster
 * + capital, mid-post, transom, the glazed door (bottom panel + glass + N×M
 * mullion grid + handle), and the display window (glass + frame) on its
 * stallriser. This is the data form of the SketchUp skeleton; the R3F surface
 * renders these boxes directly. Deterministic + DOM-free.
 */

import type { StorefrontBlock, StorefrontSpec } from './types';

// Depth (y) layering in mm — negative y is proud toward the street/viewer.
const Y_WALL = 0;
const Y_FASCIA = -90;
const Y_KEY = -98;
const Y_FIELD = -45;
const Y_PIL = -90;
const Y_FRAME = -60;
const Y_GLASS = -25;

export function specToBlocks(spec: StorefrontSpec): StorefrontBlock[] {
    const blocks: StorefrontBlock[] = [];
    const push = (
        name: string,
        x: number,
        y: number,
        z: number,
        w: number,
        d: number,
        h: number,
        material: StorefrontBlock['material'],
    ) => {
        blocks.push({ id: name, name, x, y, z, w, d, h, material });
    };

    const {
        widthMm: W,
        heightMm: H,
        wallDepthMm: WALL_T,
        fasciaHeightMm: FASCIA_H,
        doorHeadMm: DOOR_HEAD,
        stallriserHeightMm: STALL_H,
        pilasterWidthMm: PIL_W,
        jambWidthMm: JAMB_W,
        door,
        window,
    } = spec;

    const SHOP_T = H - FASCIA_H; // top of the shopfront zone / fascia underside
    const FX1 = W - PIL_W; // fascia spans up to the right pilaster

    // ---- back wall ----
    push('Back_Wall', 0, Y_WALL, 0, W, WALL_T, H, 'wall');

    // ---- fascia: surround + thin illuminated keyline + recessed sign mount ----
    push('Fascia_Surround', 0, Y_FASCIA, SHOP_T, FX1, 90, FASCIA_H, 'frame');
    const KIN = 90; // keyline inset from fascia edge
    const KT = 45; // keyline bar thickness
    const kx0 = KIN;
    const kx1 = FX1 - KIN;
    const kz0 = SHOP_T + KIN;
    const kz1 = H - KIN;
    push('Keyline_Top', kx0, Y_KEY, kz1 - KT, kx1 - kx0, 14, KT, 'keyline');
    push('Keyline_Bottom', kx0, Y_KEY, kz0, kx1 - kx0, 14, KT, 'keyline');
    push('Keyline_Left', kx0, Y_KEY, kz0, KT, 14, kz1 - kz0, 'keyline');
    push('Keyline_Right', kx1 - KT, Y_KEY, kz0, KT, 14, kz1 - kz0, 'keyline');
    const SIN = KIN + KT + 15; // sign-field inset (inside the keyline)
    push('Fascia_SignMount', SIN, Y_FIELD, SHOP_T + SIN, FX1 - 2 * SIN, 45, FASCIA_H - 2 * SIN, 'signField');

    // ---- pilasters + capital ----
    push('Left_Jamb', 0, Y_PIL, 0, JAMB_W, 90, SHOP_T, 'frame');
    push('Right_Pilaster', W - PIL_W, Y_PIL, 0, PIL_W, 90, H, 'frame');
    // Capital overhangs the pilaster inward (toward the fascia) but stays flush
    // with the building's right edge — never proud of the frontage.
    push('Right_Capital', W - PIL_W - 40, Y_PIL - 30, SHOP_T - 40, PIL_W + 40, 120, 100, 'trim');

    // ---- mid-post (door↔window) + transom ----
    const doorRight = door.xMm + door.widthMm;
    push('Mid_Post', doorRight, Y_FRAME, 0, Math.max(0, window.xMm - doorRight), 60, SHOP_T, 'frame');
    push('Transom', JAMB_W, Y_FRAME, DOOR_HEAD, FX1 - JAMB_W, 60, SHOP_T - DOOR_HEAD, 'frame');

    // ---- glazed door ----
    push('Door_BottomPanel', door.xMm, Y_FRAME, 0, door.widthMm, 60, door.bottomPanelMm, 'panel');
    const inset = 40;
    const gx0 = door.xMm + inset;
    const gx1 = doorRight - inset;
    const gz0 = door.bottomPanelMm + inset;
    const gz1 = DOOR_HEAD - inset;
    push('Door_Glass', gx0, Y_GLASS, gz0, gx1 - gx0, 12, gz1 - gz0, 'glass');
    const BW = 25; // mullion bar width
    for (let c = 1; c < door.cols; c++) {
        const xb = gx0 + ((gx1 - gx0) * c) / door.cols - BW / 2;
        push(`Door_Mullion_V${c}`, xb, Y_FRAME + 5, gz0, BW, 50, gz1 - gz0, 'frame');
    }
    for (let r = 1; r < door.rows; r++) {
        const zb = gz0 + ((gz1 - gz0) * r) / door.rows - BW / 2;
        push(`Door_Mullion_H${r}`, gx0, Y_FRAME + 5, zb, gx1 - gx0, 50, BW, 'frame');
    }
    push('Door_Handle', doorRight - 95, Y_FRAME - 15, 900, 22, 45, 420, 'handle');

    // ---- display window on stallriser ----
    const wx0 = window.xMm;
    const wx1 = window.xMm + window.widthMm;
    push('Stallriser', wx0, Y_FRAME, 0, window.widthMm, 60, STALL_H, 'panel');
    const FT = 50; // window frame thickness
    push('Window_Glass', wx0 + FT, Y_GLASS, STALL_H + FT, window.widthMm - 2 * FT, 12, DOOR_HEAD - STALL_H - 2 * FT, 'glass');
    push('Window_Frame_L', wx0, Y_FRAME, STALL_H, FT, 60, DOOR_HEAD - STALL_H, 'frame');
    push('Window_Frame_R', wx1 - FT, Y_FRAME, STALL_H, FT, 60, DOOR_HEAD - STALL_H, 'frame');
    push('Window_Frame_B', wx0, Y_FRAME, STALL_H, window.widthMm, 60, FT, 'frame');
    push('Window_Frame_T', wx0, Y_FRAME, DOOR_HEAD - FT, window.widthMm, 60, FT, 'frame');

    return blocks;
}

/** The frontage bounding box (mm) — handy for camera framing + scale checks. */
export function specBounds(spec: StorefrontSpec): { widthMm: number; heightMm: number } {
    return { widthMm: spec.widthMm, heightMm: spec.heightMm };
}
