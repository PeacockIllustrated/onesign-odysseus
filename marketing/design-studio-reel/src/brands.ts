// Real Onesign & Digital client signs for the case-study montage — using the
// actual client logo SVGs (public/brands/*.svg), each presented as a real
// fabricated sign that highlights a different material + fixing method.
export interface RealBrand {
    name: string;
    kind: string; // business type
    logo: string; // staticFile path under public/
    face: string; // sign panel/face colour
    accent: string; // nameplate accent
    material: string; // build / material callout
    fixing: string; // fixing method callout
    lit: boolean; // illuminated?
}

export const REAL_BRANDS: RealBrand[] = [
    {
        name: 'Ginger',
        kind: 'Salon',
        logo: 'brands/ginger.svg',
        face: '#f3ede1',
        accent: '#e0a24a',
        material: 'Built-up illuminated letters',
        fixing: 'Stand-off locators',
        lit: true,
    },
    {
        name: 'HERD',
        kind: 'Restaurant',
        logo: 'brands/herd.svg',
        face: '#191d20',
        accent: '#e0201c',
        material: 'Fabricated tray · LED halo',
        fixing: 'Concealed studs',
        lit: true,
    },
    {
        name: 'MetroCentre',
        kind: 'Retail destination',
        logo: 'brands/metrocentre.svg',
        face: '#f4f6f6',
        accent: '#03848a',
        material: 'Flat-cut acrylic on tray',
        fixing: 'Flush stud-mount',
        lit: false,
    },
];
