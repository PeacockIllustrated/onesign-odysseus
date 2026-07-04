// Real Onesign & Digital clients, pulled from the production database
// (visualiser_designs / brand_profiles / psp_orders). Used for the
// social-proof montage — real signs, real North-East businesses.
export interface RealBrand {
    name: string;
    kind: string; // business type
    spec: string; // short sign description
    accent: string; // card accent colour
    lit: boolean; // illuminated sign?
}

export const REAL_BRANDS: RealBrand[] = [
    {
        name: 'Black Rabbit',
        kind: 'Bar · The Warren',
        spec: '4050 × 285 mm · illuminated aluminium',
        accent: '#d9a441',
        lit: true,
    },
    {
        name: 'HERD',
        kind: 'Restaurant',
        spec: 'Neon feature sign',
        accent: '#ff5d5d',
        lit: true,
    },
    {
        name: 'Ginger',
        kind: 'Salon',
        spec: '4400 × 650 mm · illuminated aluminium',
        accent: '#e8743b',
        lit: true,
    },
    {
        name: 'Aqua TCG',
        kind: 'Card & games store',
        spec: 'Cut-vinyl aperture sign',
        accent: '#35b6c7',
        lit: false,
    },
    {
        name: 'FCR Roofing',
        kind: 'Roofing & building',
        spec: 'Fabricated fascia sign',
        accent: '#376fa4',
        lit: false,
    },
    {
        name: 'Persimmon',
        kind: 'National housebuilder',
        spec: 'Live production orders',
        accent: '#5c9a4f',
        lit: false,
    },
];
