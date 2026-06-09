/**
 * RAL Classic palette.
 *
 * The panel base colour must be specified as a RAL for production (the powder-
 * coat / paint is ordered by RAL number), so the visualiser picks the panel
 * colour from this list rather than a free hex. The `hex` values are the
 * standard sRGB approximations of each RAL Classic shade — close enough to
 * preview, but the RAL NUMBER is the source of truth on the production docs
 * (screen colour never matches coated metal exactly).
 */

export interface RalColour {
    /** e.g. 'RAL 9016'. */
    code: string;
    name: string;
    /** sRGB approximation for the on-screen preview. */
    hex: string;
}

export const RAL_CLASSIC: RalColour[] = [
    { code: 'RAL 1000', name: 'Green beige', hex: '#cdba88' },
    { code: 'RAL 1001', name: 'Beige', hex: '#d0b084' },
    { code: 'RAL 1002', name: 'Sand yellow', hex: '#d2aa6d' },
    { code: 'RAL 1003', name: 'Signal yellow', hex: '#f9a800' },
    { code: 'RAL 1004', name: 'Golden yellow', hex: '#e49e00' },
    { code: 'RAL 1005', name: 'Honey yellow', hex: '#cb8e00' },
    { code: 'RAL 1006', name: 'Maize yellow', hex: '#e29000' },
    { code: 'RAL 1007', name: 'Daffodil yellow', hex: '#e88c00' },
    { code: 'RAL 1011', name: 'Brown beige', hex: '#af804f' },
    { code: 'RAL 1012', name: 'Lemon yellow', hex: '#ddaf27' },
    { code: 'RAL 1013', name: 'Oyster white', hex: '#e3d9c6' },
    { code: 'RAL 1014', name: 'Ivory', hex: '#ddc49a' },
    { code: 'RAL 1015', name: 'Light ivory', hex: '#e6d2b5' },
    { code: 'RAL 1016', name: 'Sulfur yellow', hex: '#f1dd38' },
    { code: 'RAL 1017', name: 'Saffron yellow', hex: '#f6a951' },
    { code: 'RAL 1018', name: 'Zinc yellow', hex: '#faca30' },
    { code: 'RAL 1019', name: 'Grey beige', hex: '#a48f7a' },
    { code: 'RAL 1020', name: 'Olive yellow', hex: '#a08f65' },
    { code: 'RAL 1021', name: 'Rape yellow', hex: '#f6b600' },
    { code: 'RAL 1023', name: 'Traffic yellow', hex: '#f7b500' },
    { code: 'RAL 1024', name: 'Ochre yellow', hex: '#ba8f4c' },
    { code: 'RAL 1026', name: 'Luminous yellow', hex: '#ffff00' },
    { code: 'RAL 1027', name: 'Curry', hex: '#a77f0e' },
    { code: 'RAL 1028', name: 'Melon yellow', hex: '#ff9b00' },
    { code: 'RAL 1032', name: 'Broom yellow', hex: '#e2a300' },
    { code: 'RAL 1033', name: 'Dahlia yellow', hex: '#f99a1c' },
    { code: 'RAL 1034', name: 'Pastel yellow', hex: '#eb9c52' },
    { code: 'RAL 1035', name: 'Pearl beige', hex: '#908370' },
    { code: 'RAL 1036', name: 'Pearl gold', hex: '#80643f' },
    { code: 'RAL 1037', name: 'Sun yellow', hex: '#f09200' },
    { code: 'RAL 2000', name: 'Yellow orange', hex: '#da6e00' },
    { code: 'RAL 2001', name: 'Red orange', hex: '#ba481b' },
    { code: 'RAL 2002', name: 'Vermilion', hex: '#bf3922' },
    { code: 'RAL 2003', name: 'Pastel orange', hex: '#f67828' },
    { code: 'RAL 2004', name: 'Pure orange', hex: '#e25303' },
    { code: 'RAL 2005', name: 'Luminous orange', hex: '#ff4d06' },
    { code: 'RAL 2007', name: 'Luminous bright orange', hex: '#ffb200' },
    { code: 'RAL 2008', name: 'Bright red orange', hex: '#ed6b21' },
    { code: 'RAL 2009', name: 'Traffic orange', hex: '#de5307' },
    { code: 'RAL 2010', name: 'Signal orange', hex: '#d05d29' },
    { code: 'RAL 2011', name: 'Deep orange', hex: '#e26e0e' },
    { code: 'RAL 2012', name: 'Salmon orange', hex: '#d5654d' },
    { code: 'RAL 2013', name: 'Pearl orange', hex: '#923e25' },
    { code: 'RAL 3000', name: 'Flame red', hex: '#a72920' },
    { code: 'RAL 3001', name: 'Signal red', hex: '#9b2423' },
    { code: 'RAL 3002', name: 'Carmine red', hex: '#9b2321' },
    { code: 'RAL 3003', name: 'Ruby red', hex: '#861a22' },
    { code: 'RAL 3004', name: 'Purple red', hex: '#6b1c23' },
    { code: 'RAL 3005', name: 'Wine red', hex: '#59191f' },
    { code: 'RAL 3007', name: 'Black red', hex: '#3e2022' },
    { code: 'RAL 3009', name: 'Oxide red', hex: '#6d342d' },
    { code: 'RAL 3011', name: 'Brown red', hex: '#792423' },
    { code: 'RAL 3012', name: 'Beige red', hex: '#c6846d' },
    { code: 'RAL 3013', name: 'Tomato red', hex: '#9c322e' },
    { code: 'RAL 3014', name: 'Antique pink', hex: '#cb7375' },
    { code: 'RAL 3015', name: 'Light pink', hex: '#d8a0a6' },
    { code: 'RAL 3016', name: 'Coral red', hex: '#a73a38' },
    { code: 'RAL 3017', name: 'Rose', hex: '#cc6164' },
    { code: 'RAL 3018', name: 'Strawberry red', hex: '#cc393f' },
    { code: 'RAL 3020', name: 'Traffic red', hex: '#c1121c' },
    { code: 'RAL 3022', name: 'Salmon pink', hex: '#d57672' },
    { code: 'RAL 3024', name: 'Luminous red', hex: '#ff2d21' },
    { code: 'RAL 3026', name: 'Luminous bright red', hex: '#ff2a1c' },
    { code: 'RAL 3027', name: 'Raspberry red', hex: '#ab273c' },
    { code: 'RAL 3028', name: 'Pure red', hex: '#cb3234' },
    { code: 'RAL 3031', name: 'Orient red', hex: '#a63437' },
    { code: 'RAL 3032', name: 'Pearl ruby red', hex: '#701d23' },
    { code: 'RAL 3033', name: 'Pearl pink', hex: '#a53a2d' },
    { code: 'RAL 4001', name: 'Red lilac', hex: '#816183' },
    { code: 'RAL 4002', name: 'Red violet', hex: '#8d3c4b' },
    { code: 'RAL 4003', name: 'Heather violet', hex: '#c4618c' },
    { code: 'RAL 4004', name: 'Claret violet', hex: '#651e38' },
    { code: 'RAL 4005', name: 'Blue lilac', hex: '#76689a' },
    { code: 'RAL 4006', name: 'Traffic purple', hex: '#903373' },
    { code: 'RAL 4007', name: 'Purple violet', hex: '#47243c' },
    { code: 'RAL 4008', name: 'Signal violet', hex: '#844c82' },
    { code: 'RAL 4009', name: 'Pastel violet', hex: '#a18594' },
    { code: 'RAL 4010', name: 'Telemagenta', hex: '#bd4490' },
    { code: 'RAL 4011', name: 'Pearl violet', hex: '#6e6794' },
    { code: 'RAL 4012', name: 'Pearl blackberry', hex: '#6b6880' },
    { code: 'RAL 5000', name: 'Violet blue', hex: '#314f6f' },
    { code: 'RAL 5001', name: 'Green blue', hex: '#0f4c64' },
    { code: 'RAL 5002', name: 'Ultramarine blue', hex: '#00387b' },
    { code: 'RAL 5003', name: 'Sapphire blue', hex: '#1f3855' },
    { code: 'RAL 5004', name: 'Black blue', hex: '#191e28' },
    { code: 'RAL 5005', name: 'Signal blue', hex: '#005387' },
    { code: 'RAL 5007', name: 'Brilliant blue', hex: '#376b8c' },
    { code: 'RAL 5008', name: 'Grey blue', hex: '#2b3a44' },
    { code: 'RAL 5009', name: 'Azure blue', hex: '#225f78' },
    { code: 'RAL 5010', name: 'Gentian blue', hex: '#004f7c' },
    { code: 'RAL 5011', name: 'Steel blue', hex: '#1a2b3c' },
    { code: 'RAL 5012', name: 'Light blue', hex: '#0089b6' },
    { code: 'RAL 5013', name: 'Cobalt blue', hex: '#193153' },
    { code: 'RAL 5014', name: 'Pigeon blue', hex: '#637d96' },
    { code: 'RAL 5015', name: 'Sky blue', hex: '#0079b4' },
    { code: 'RAL 5017', name: 'Traffic blue', hex: '#005a8c' },
    { code: 'RAL 5018', name: 'Turquoise blue', hex: '#048b8c' },
    { code: 'RAL 5019', name: 'Capri blue', hex: '#005e83' },
    { code: 'RAL 5020', name: 'Ocean blue', hex: '#00414b' },
    { code: 'RAL 5021', name: 'Water blue', hex: '#007577' },
    { code: 'RAL 5022', name: 'Night blue', hex: '#222d5a' },
    { code: 'RAL 5023', name: 'Distant blue', hex: '#41698c' },
    { code: 'RAL 5024', name: 'Pastel blue', hex: '#6093ab' },
    { code: 'RAL 5025', name: 'Pearl gentian blue', hex: '#21697c' },
    { code: 'RAL 5026', name: 'Pearl night blue', hex: '#13233f' },
    { code: 'RAL 6000', name: 'Patina green', hex: '#3c7460' },
    { code: 'RAL 6001', name: 'Emerald green', hex: '#366735' },
    { code: 'RAL 6002', name: 'Leaf green', hex: '#325928' },
    { code: 'RAL 6003', name: 'Olive green', hex: '#50533c' },
    { code: 'RAL 6004', name: 'Blue green', hex: '#024442' },
    { code: 'RAL 6005', name: 'Moss green', hex: '#114232' },
    { code: 'RAL 6006', name: 'Grey olive', hex: '#3c392e' },
    { code: 'RAL 6007', name: 'Bottle green', hex: '#2c3222' },
    { code: 'RAL 6008', name: 'Brown green', hex: '#37342a' },
    { code: 'RAL 6009', name: 'Fir green', hex: '#27352a' },
    { code: 'RAL 6010', name: 'Grass green', hex: '#4d6f39' },
    { code: 'RAL 6011', name: 'Reseda green', hex: '#6c7c59' },
    { code: 'RAL 6012', name: 'Black green', hex: '#2f3d3a' },
    { code: 'RAL 6013', name: 'Reed green', hex: '#7c765a' },
    { code: 'RAL 6014', name: 'Yellow olive', hex: '#474135' },
    { code: 'RAL 6015', name: 'Black olive', hex: '#3d3d36' },
    { code: 'RAL 6016', name: 'Turquoise green', hex: '#00694c' },
    { code: 'RAL 6017', name: 'May green', hex: '#587f40' },
    { code: 'RAL 6018', name: 'Yellow green', hex: '#61993b' },
    { code: 'RAL 6019', name: 'Pastel green', hex: '#b9ceac' },
    { code: 'RAL 6020', name: 'Chrome green', hex: '#37422f' },
    { code: 'RAL 6021', name: 'Pale green', hex: '#8a9977' },
    { code: 'RAL 6022', name: 'Olive drab', hex: '#3a3327' },
    { code: 'RAL 6024', name: 'Traffic green', hex: '#008351' },
    { code: 'RAL 6025', name: 'Fern green', hex: '#5e6e3b' },
    { code: 'RAL 6026', name: 'Opal green', hex: '#005f4e' },
    { code: 'RAL 6027', name: 'Light green', hex: '#7ebab5' },
    { code: 'RAL 6028', name: 'Pine green', hex: '#315442' },
    { code: 'RAL 6029', name: 'Mint green', hex: '#006f3d' },
    { code: 'RAL 6032', name: 'Signal green', hex: '#237f52' },
    { code: 'RAL 6033', name: 'Mint turquoise', hex: '#45877f' },
    { code: 'RAL 6034', name: 'Pastel turquoise', hex: '#7fb0b2' },
    { code: 'RAL 6035', name: 'Pearl green', hex: '#194d25' },
    { code: 'RAL 6036', name: 'Pearl opal green', hex: '#04574b' },
    { code: 'RAL 6037', name: 'Pure green', hex: '#008f39' },
    { code: 'RAL 6038', name: 'Luminous green', hex: '#00bb2d' },
    { code: 'RAL 7000', name: 'Squirrel grey', hex: '#7e8b92' },
    { code: 'RAL 7001', name: 'Silver grey', hex: '#8f999f' },
    { code: 'RAL 7002', name: 'Olive grey', hex: '#817f68' },
    { code: 'RAL 7003', name: 'Moss grey', hex: '#7a7b6d' },
    { code: 'RAL 7004', name: 'Signal grey', hex: '#9c9c9c' },
    { code: 'RAL 7005', name: 'Mouse grey', hex: '#6b716f' },
    { code: 'RAL 7006', name: 'Beige grey', hex: '#766a5e' },
    { code: 'RAL 7008', name: 'Khaki grey', hex: '#745f3d' },
    { code: 'RAL 7009', name: 'Green grey', hex: '#5d6058' },
    { code: 'RAL 7010', name: 'Tarpaulin grey', hex: '#585c56' },
    { code: 'RAL 7011', name: 'Iron grey', hex: '#52595d' },
    { code: 'RAL 7012', name: 'Basalt grey', hex: '#575d5e' },
    { code: 'RAL 7013', name: 'Brown grey', hex: '#575044' },
    { code: 'RAL 7015', name: 'Slate grey', hex: '#4f5358' },
    { code: 'RAL 7016', name: 'Anthracite grey', hex: '#383e42' },
    { code: 'RAL 7021', name: 'Black grey', hex: '#2f3234' },
    { code: 'RAL 7022', name: 'Umbra grey', hex: '#4c4a44' },
    { code: 'RAL 7023', name: 'Concrete grey', hex: '#808076' },
    { code: 'RAL 7024', name: 'Graphite grey', hex: '#45494e' },
    { code: 'RAL 7026', name: 'Granite grey', hex: '#374345' },
    { code: 'RAL 7030', name: 'Stone grey', hex: '#928e85' },
    { code: 'RAL 7031', name: 'Blue grey', hex: '#5b686d' },
    { code: 'RAL 7032', name: 'Pebble grey', hex: '#b5b0a1' },
    { code: 'RAL 7033', name: 'Cement grey', hex: '#7f8274' },
    { code: 'RAL 7034', name: 'Yellow grey', hex: '#92886f' },
    { code: 'RAL 7035', name: 'Light grey', hex: '#c5c7c4' },
    { code: 'RAL 7036', name: 'Platinum grey', hex: '#979392' },
    { code: 'RAL 7037', name: 'Dusty grey', hex: '#7a7b7a' },
    { code: 'RAL 7038', name: 'Agate grey', hex: '#b0b0a9' },
    { code: 'RAL 7039', name: 'Quartz grey', hex: '#6b6660' },
    { code: 'RAL 7040', name: 'Window grey', hex: '#9a9ea1' },
    { code: 'RAL 7042', name: 'Traffic grey A', hex: '#8d9295' },
    { code: 'RAL 7043', name: 'Traffic grey B', hex: '#4e5451' },
    { code: 'RAL 7044', name: 'Silk grey', hex: '#b7b3a8' },
    { code: 'RAL 7045', name: 'Telegrey 1', hex: '#909090' },
    { code: 'RAL 7046', name: 'Telegrey 2', hex: '#82898e' },
    { code: 'RAL 7047', name: 'Telegrey 4', hex: '#cacaca' },
    { code: 'RAL 7048', name: 'Pearl mouse grey', hex: '#827b73' },
    { code: 'RAL 8000', name: 'Green brown', hex: '#89693e' },
    { code: 'RAL 8001', name: 'Ochre brown', hex: '#9d622b' },
    { code: 'RAL 8002', name: 'Signal brown', hex: '#794d3e' },
    { code: 'RAL 8003', name: 'Clay brown', hex: '#7e4b27' },
    { code: 'RAL 8004', name: 'Copper brown', hex: '#8d4931' },
    { code: 'RAL 8007', name: 'Fawn brown', hex: '#6f4a2f' },
    { code: 'RAL 8008', name: 'Olive brown', hex: '#6f4f28' },
    { code: 'RAL 8011', name: 'Nut brown', hex: '#5a3827' },
    { code: 'RAL 8012', name: 'Red brown', hex: '#673831' },
    { code: 'RAL 8014', name: 'Sepia brown', hex: '#49392d' },
    { code: 'RAL 8015', name: 'Chestnut brown', hex: '#633a34' },
    { code: 'RAL 8016', name: 'Mahogany brown', hex: '#4c2f26' },
    { code: 'RAL 8017', name: 'Chocolate brown', hex: '#44322d' },
    { code: 'RAL 8019', name: 'Grey brown', hex: '#3d3635' },
    { code: 'RAL 8022', name: 'Black brown', hex: '#1a1718' },
    { code: 'RAL 8023', name: 'Orange brown', hex: '#a45729' },
    { code: 'RAL 8024', name: 'Beige brown', hex: '#795038' },
    { code: 'RAL 8025', name: 'Pale brown', hex: '#755847' },
    { code: 'RAL 8028', name: 'Terra brown', hex: '#513a2a' },
    { code: 'RAL 8029', name: 'Pearl copper', hex: '#7e402e' },
    { code: 'RAL 9001', name: 'Cream', hex: '#e9e0d2' },
    { code: 'RAL 9002', name: 'Grey white', hex: '#d7d5cb' },
    { code: 'RAL 9003', name: 'Signal white', hex: '#ecece7' },
    { code: 'RAL 9004', name: 'Signal black', hex: '#2b2b2c' },
    { code: 'RAL 9005', name: 'Jet black', hex: '#0a0a0d' },
    { code: 'RAL 9006', name: 'White aluminium', hex: '#a5a5a5' },
    { code: 'RAL 9007', name: 'Grey aluminium', hex: '#8f8f8c' },
    { code: 'RAL 9010', name: 'Pure white', hex: '#f7f9ef' },
    { code: 'RAL 9011', name: 'Graphite black', hex: '#27292b' },
    { code: 'RAL 9016', name: 'Traffic white', hex: '#f7fbf5' },
    { code: 'RAL 9017', name: 'Traffic black', hex: '#2a2d2f' },
    { code: 'RAL 9018', name: 'Papyrus white', hex: '#c8cbc4' },
    { code: 'RAL 9022', name: 'Pearl light grey', hex: '#9c9c9c' },
    { code: 'RAL 9023', name: 'Pearl dark grey', hex: '#7e8182' },
];

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

/** sRGB hex → CIE L*a*b* (D65) — the perceptual space the match runs in. */
export function srgbToLab(hex: string): [number, number, number] {
    const [r8, g8, b8] = hexToRgb(hex);
    const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = lin(r8);
    const g = lin(g8);
    const b = lin(b8);
    // linear sRGB → XYZ (D65), normalised by the D65 white point.
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const f = (t: number) =>
        t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    x = f(x);
    y = f(y);
    z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * CIEDE2000 colour difference between two L*a*b* values (kL=kC=kH=1).
 * Perceptually uniform — much closer to how different two colours LOOK than
 * raw RGB distance, with the green/blue corrections that plain Lab (ΔE76)
 * still gets wrong. Implementation per Sharma, Wu & Dalal (2005).
 */
export function deltaE2000(
    lab1: [number, number, number],
    lab2: [number, number, number],
): number {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;

    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const Cbar7 = Cbar ** 7;
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const h1p = ((Math.atan2(b1, a1p) * deg) % 360 + 360) % 360;
    const h2p = ((Math.atan2(b2, a2p) * deg) % 360 + 360) % 360;

    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
        const diff = h2p - h1p;
        if (Math.abs(diff) <= 180) dhp = diff;
        else if (diff > 180) dhp = diff - 360;
        else dhp = diff + 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);

    const Lbarp = (L1 + L2) / 2;
    const Cbarp = (C1p + C2p) / 2;
    let hbarp = h1p + h2p;
    if (C1p * C2p !== 0) {
        if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
        else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
        else hbarp = (h1p + h2p - 360) / 2;
    }
    const T =
        1 -
        0.17 * Math.cos((hbarp - 30) * rad) +
        0.24 * Math.cos(2 * hbarp * rad) +
        0.32 * Math.cos((3 * hbarp + 6) * rad) -
        0.2 * Math.cos((4 * hbarp - 63) * rad);
    const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
    const Cbarp7 = Cbarp ** 7;
    const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
    const SL =
        1 +
        (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
    const SC = 1 + 0.045 * Cbarp;
    const SH = 1 + 0.015 * Cbarp * T;
    const RT = -Math.sin(2 * dTheta * rad) * Rc;

    return Math.sqrt(
        (dLp / SL) ** 2 +
            (dCp / SC) ** 2 +
            (dHp / SH) ** 2 +
            RT * (dCp / SC) * (dHp / SH),
    );
}

/** Look up a RAL by its code (case/space-insensitive), or null. */
export function ralByCode(code: string | undefined | null): RalColour | null {
    if (!code) return null;
    const norm = code.replace(/\s+/g, '').toUpperCase();
    return (
        RAL_CLASSIC.find(
            (r) => r.code.replace(/\s+/g, '').toUpperCase() === norm,
        ) ?? null
    );
}

// Pre-compute each RAL's Lab once (the list is static) so a match is just the
// ΔE2000 loop.
const RAL_LAB: Array<[number, number, number]> = RAL_CLASSIC.map((c) =>
    srgbToLab(c.hex),
);

/**
 * Nearest RAL Classic colour to an arbitrary hex, by perceptual CIEDE2000
 * distance (not raw RGB) — so the suggested RAL is the one that LOOKS closest,
 * which matters most in the green/blue regions where RGB distance misleads.
 */
export function nearestRal(hex: string): RalColour {
    const lab = srgbToLab(hex);
    let best = RAL_CLASSIC[0];
    let bestD = Infinity;
    for (let i = 0; i < RAL_CLASSIC.length; i++) {
        const d = deltaE2000(lab, RAL_LAB[i]);
        if (d < bestD) {
            bestD = d;
            best = RAL_CLASSIC[i];
        }
    }
    return best;
}
