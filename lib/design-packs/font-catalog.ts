/**
 * Curated Google Font pairs for signage design
 *
 * Fonts selected for:
 * - High legibility at large sizes (outdoor signage)
 * - Professional appearance
 * - Complementary primary/secondary pairings
 * - Good weight variety for hierarchy
 */

import { FontSelection } from './types';

// =============================================================================
// FONT PAIR INTERFACE
// =============================================================================

export type FontCategory = 'modern' | 'classic' | 'industrial' | 'organic' | 'condensed' | 'bold';

export interface FontPair {
    id: string;
    name: string;
    description: string;
    category: FontCategory;
    primary_font: FontSelection;
    secondary_font: FontSelection;
    preview_text: {
        headline: string;
        subheading: string;
        body: string;
    };
}

// =============================================================================
// CURATED FONT PAIRS
// =============================================================================

export const FONT_CATALOG: FontPair[] = [
    // MODERN CATEGORY
    {
        id: 'montserrat-opensans',
        name: 'modern & clean',
        description: 'geometric sans-serif pairing for contemporary wayfinding',
        category: 'modern',
        primary_font: {
            family: 'Montserrat',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;800&display=swap',
        },
        secondary_font: {
            family: 'Open Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'visitor centre',
            subheading: 'main entrance',
            body: 'opening times: daily 9am - 5pm',
        },
    },
    {
        id: 'poppins-inter',
        name: 'friendly & approachable',
        description: 'rounded letterforms ideal for family-oriented spaces',
        category: 'modern',
        primary_font: {
            family: 'Poppins',
            weight: 600,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap',
        },
        secondary_font: {
            family: 'Inter',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'adventure playground',
            subheading: 'ages 3-12',
            body: 'supervised play area with sensory garden',
        },
    },
    {
        id: 'dmsans-worksans',
        name: 'technical & precise',
        description: 'geometric clarity for industrial and sports venues',
        category: 'modern',
        primary_font: {
            family: 'DM Sans',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Work Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'athletics track',
            subheading: 'facility information',
            body: 'all-weather surface, open access policy',
        },
    },
    {
        id: 'urbanist-manrope',
        name: 'contemporary edge',
        description: 'sharp, clean lines for modern commercial spaces',
        category: 'modern',
        primary_font: {
            family: 'Urbanist',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Urbanist:wght@400;700;800&display=swap',
        },
        secondary_font: {
            family: 'Manrope',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'reception',
            subheading: 'level 2',
            body: 'check in at the main desk for assistance',
        },
    },
    {
        id: 'spaceGrotesk-plusJakarta',
        name: 'tech forward',
        description: 'futuristic feel for innovation hubs and tech spaces',
        category: 'modern',
        primary_font: {
            family: 'Space Grotesk',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Plus Jakarta Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'innovation lab',
            subheading: 'collaboration zone',
            body: 'book meeting spaces via the app',
        },
    },

    // CLASSIC CATEGORY
    {
        id: 'raleway-lato',
        name: 'elegant & spacious',
        description: 'refined letterforms for heritage and cultural sites',
        category: 'classic',
        primary_font: {
            family: 'Raleway',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;700;800&display=swap',
        },
        secondary_font: {
            family: 'Lato',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap',
        },
        preview_text: {
            headline: 'woodland trail',
            subheading: 'historic route',
            body: 'discover 200 years of landscape heritage',
        },
    },
    {
        id: 'playfair-sourceSans',
        name: 'timeless elegance',
        description: 'serif and sans combination for museums and galleries',
        category: 'classic',
        primary_font: {
            family: 'Playfair Display',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;800&display=swap',
        },
        secondary_font: {
            family: 'Source Sans 3',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'gallery wing',
            subheading: 'permanent collection',
            body: 'exhibition halls featuring contemporary art',
        },
    },
    {
        id: 'cormorant-karla',
        name: 'refined heritage',
        description: 'sophisticated serif for historical buildings',
        category: 'classic',
        primary_font: {
            family: 'Cormorant Garamond',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Karla',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Karla:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'manor house',
            subheading: 'est. 1742',
            body: 'guided tours available tuesday to sunday',
        },
    },
    {
        id: 'crimson-nunito',
        name: 'scholarly classic',
        description: 'traditional serif for libraries and educational spaces',
        category: 'classic',
        primary_font: {
            family: 'Crimson Text',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Nunito Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'reading room',
            subheading: 'quiet study area',
            body: 'please silence mobile devices',
        },
    },

    // INDUSTRIAL CATEGORY
    {
        id: 'oswald-roboto',
        name: 'industrial strength',
        description: 'bold condensed letterforms for warehouses and factories',
        category: 'industrial',
        primary_font: {
            family: 'Oswald',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Roboto',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'loading bay',
            subheading: 'dock 5-8',
            body: 'authorized personnel only beyond this point',
        },
    },
    {
        id: 'bebas-openSans',
        name: 'mechanical bold',
        description: 'heavy impact for construction and industrial sites',
        category: 'industrial',
        primary_font: {
            family: 'Bebas Neue',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
        },
        secondary_font: {
            family: 'Open Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'danger zone',
            subheading: 'ppe required',
            body: 'hard hats and safety boots must be worn',
        },
    },
    {
        id: 'antonio-archivo',
        name: 'utility functional',
        description: 'no-nonsense clarity for logistics and transport',
        category: 'industrial',
        primary_font: {
            family: 'Antonio',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Antonio:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Archivo',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'warehouse 12',
            subheading: 'zone c',
            body: 'forklift traffic - keep clear',
        },
    },
    {
        id: 'saira-ibm',
        name: 'technical precision',
        description: 'engineered letterforms for tech and manufacturing',
        category: 'industrial',
        primary_font: {
            family: 'Saira Condensed',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'IBM Plex Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'assembly line',
            subheading: 'station 03',
            body: 'quality control checkpoint ahead',
        },
    },

    // ORGANIC CATEGORY
    {
        id: 'comfortaa-quicksand',
        name: 'soft & natural',
        description: 'gentle curves for gardens and nature centers',
        category: 'organic',
        primary_font: {
            family: 'Comfortaa',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Quicksand',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'butterfly garden',
            subheading: 'seasonal display',
            body: 'please stay on marked paths to protect wildlife',
        },
    },
    {
        id: 'cabin-hind',
        name: 'woodland rustic',
        description: 'hand-crafted feel for outdoor and eco spaces',
        category: 'organic',
        primary_font: {
            family: 'Cabin',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Cabin:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Hind',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Hind:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'forest trail',
            subheading: 'moderate difficulty',
            body: 'circular route approximately 3 miles',
        },
    },
    {
        id: 'josefin-muli',
        name: 'flowing organic',
        description: 'smooth curves for wellness and spa environments',
        category: 'organic',
        primary_font: {
            family: 'Josefin Sans',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Mulish',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Mulish:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'wellness centre',
            subheading: 'relaxation zone',
            body: 'please maintain a peaceful atmosphere',
        },
    },
    {
        id: 'varela-alata',
        name: 'natural harmony',
        description: 'balanced letterforms for botanical gardens',
        category: 'organic',
        primary_font: {
            family: 'Varela Round',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Varela+Round&display=swap',
        },
        secondary_font: {
            family: 'Alata',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Alata&display=swap',
        },
        preview_text: {
            headline: 'herb garden',
            subheading: 'medicinal plants',
            body: 'discover traditional remedies and aromatherapy',
        },
    },

    // CONDENSED CATEGORY
    {
        id: 'barlow-rubik',
        name: 'space efficient',
        description: 'condensed letterforms for compact signage',
        category: 'condensed',
        primary_font: {
            family: 'Barlow Condensed',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'Rubik',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'parking level 3',
            subheading: 'spaces 201-350',
            body: 'elevator access at both ends',
        },
    },
    {
        id: 'yanone-pt',
        name: 'narrow precision',
        description: 'tall narrow letters for directional signage',
        category: 'condensed',
        primary_font: {
            family: 'Yanone Kaffeesatz',
            weight: 700,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Yanone+Kaffeesatz:wght@400;700&display=swap',
        },
        secondary_font: {
            family: 'PT Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap',
        },
        preview_text: {
            headline: 'exits 5-12',
            subheading: 'emergency route',
            body: 'follow green signs in case of evacuation',
        },
    },
    {
        id: 'fjalla-noto',
        name: 'compact impact',
        description: 'condensed boldness for high-traffic areas',
        category: 'condensed',
        primary_font: {
            family: 'Fjalla One',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Fjalla+One&display=swap',
        },
        secondary_font: {
            family: 'Noto Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'terminal 2',
            subheading: 'gates 20-35',
            body: 'check departure boards for gate information',
        },
    },

    // BOLD CATEGORY
    {
        id: 'outfit-nunito',
        name: 'bold & impactful',
        description: 'high contrast for maximum visibility at distance',
        category: 'bold',
        primary_font: {
            family: 'Outfit',
            weight: 800,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;800&display=swap',
        },
        secondary_font: {
            family: 'Nunito',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'car park',
            subheading: 'overflow parking',
            body: 'follow signs to main entrance',
        },
    },
    {
        id: 'black-ops-roboto',
        name: 'maximum impact',
        description: 'ultra-bold for attention-demanding locations',
        category: 'bold',
        primary_font: {
            family: 'Black Ops One',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap',
        },
        secondary_font: {
            family: 'Roboto',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap',
        },
        preview_text: {
            headline: 'stop',
            subheading: 'security checkpoint',
            body: 'all visitors must register at reception',
        },
    },
    {
        id: 'archivo-black-source',
        name: 'heavy weight',
        description: 'powerful presence for architectural signage',
        category: 'bold',
        primary_font: {
            family: 'Archivo Black',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap',
        },
        secondary_font: {
            family: 'Source Sans 3',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'stadium entrance',
            subheading: 'south stand',
            body: 'please have tickets ready for inspection',
        },
    },
    {
        id: 'exo-openSans',
        name: 'strong & stable',
        description: 'bold geometric for sports and activity centers',
        category: 'bold',
        primary_font: {
            family: 'Exo 2',
            weight: 800,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;800&display=swap',
        },
        secondary_font: {
            family: 'Open Sans',
            weight: 400,
            google_font_url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap',
        },
        preview_text: {
            headline: 'sports hall',
            subheading: 'courts 1-4',
            body: 'book online or at the front desk',
        },
    },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get font pair by ID
 */
export function getFontPairById(id: string): FontPair | undefined {
    return FONT_CATALOG.find((pair) => pair.id === id);
}

/**
 * Get all font pair IDs
 */
export function getAllFontPairIds(): string[] {
    return FONT_CATALOG.map((pair) => pair.id);
}

/**
 * Get font pairs by category
 */
export function getFontPairsByCategory(category: FontCategory): FontPair[] {
    return FONT_CATALOG.filter((pair) => pair.category === category);
}

/**
 * Get all unique categories
 */
export function getAllCategories(): FontCategory[] {
    return ['modern', 'classic', 'industrial', 'organic', 'condensed', 'bold'];
}

/**
 * Get category label
 */
export function getCategoryLabel(category: FontCategory): string {
    const labels: Record<FontCategory, string> = {
        modern: 'modern',
        classic: 'classic',
        industrial: 'industrial',
        organic: 'organic',
        condensed: 'condensed',
        bold: 'bold',
    };
    return labels[category];
}

/**
 * Get font families for preloading
 */
export function getAllFontFamilies(): string[] {
    const families = new Set<string>();
    FONT_CATALOG.forEach((pair) => {
        families.add(pair.primary_font.family);
        families.add(pair.secondary_font.family);
    });
    return Array.from(families);
}

/**
 * Get all Google Font URLs for preloading
 */
export function getAllFontUrls(): string[] {
    const urls = new Set<string>();
    FONT_CATALOG.forEach((pair) => {
        if (pair.primary_font.google_font_url) {
            urls.add(pair.primary_font.google_font_url);
        }
        if (pair.secondary_font.google_font_url) {
            urls.add(pair.secondary_font.google_font_url);
        }
    });
    return Array.from(urls);
}

// =============================================================================
// SIGNAGE SIZE REFERENCE
// =============================================================================

/**
 * Reference scales for displaying fonts at signage sizes
 *
 * Physical signage letter heights and their screen equivalents at different scales
 */
export const SIGNAGE_SCALES = {
    '1:10': {
        label: 'shown at 1:10 scale',
        // Physical size → Screen size at 96 DPI
        sizes: {
            300: 113, // 300mm → 30mm screen → 113px
            200: 75, // 200mm → 20mm screen → 75px
            150: 57, // 150mm → 15mm screen → 57px
            100: 38, // 100mm → 10mm screen → 38px
            75: 28, // 75mm → 7.5mm screen → 28px
            50: 19, // 50mm → 5mm screen → 19px
        },
    },
    '1:15': {
        label: 'shown at 1:15 scale',
        sizes: {
            300: 75, // 300mm → 20mm screen → 75px
            200: 50, // 200mm → 13.3mm screen → 50px
            150: 38, // 150mm → 10mm screen → 38px
            100: 25, // 100mm → 6.7mm screen → 25px
            75: 19, // 75mm → 5mm screen → 19px
            50: 13, // 50mm → 3.3mm screen → 13px
        },
    },
};

/**
 * Get screen pixel size for a physical signage dimension
 */
export function getScreenSize(physicalMm: number, scale: '1:10' | '1:15'): number {
    const scaleData = SIGNAGE_SCALES[scale];
    return scaleData.sizes[physicalMm as keyof typeof scaleData.sizes] || physicalMm / (scale === '1:10' ? 10 : 15);
}

/**
 * Typography hierarchy for signage
 */
export interface SignageTypographyLevel {
    label: string;
    physical_mm: number;
    screen_px_1_10: number;
    screen_px_1_15: number;
    usage: string;
}

export const SIGNAGE_TYPOGRAPHY_LEVELS: SignageTypographyLevel[] = [
    {
        label: 'h1 / main headline',
        physical_mm: 300,
        screen_px_1_10: 113,
        screen_px_1_15: 75,
        usage: 'building names, primary wayfinding',
    },
    {
        label: 'h2 / section header',
        physical_mm: 200,
        screen_px_1_10: 75,
        screen_px_1_15: 50,
        usage: 'departmental signage, zone identification',
    },
    {
        label: 'h3 / subheading',
        physical_mm: 150,
        screen_px_1_10: 57,
        screen_px_1_15: 38,
        usage: 'directional arrows, room names',
    },
    {
        label: 'body / information',
        physical_mm: 100,
        screen_px_1_10: 38,
        screen_px_1_15: 25,
        usage: 'opening times, descriptions',
    },
    {
        label: 'caption / small print',
        physical_mm: 75,
        screen_px_1_10: 28,
        screen_px_1_15: 19,
        usage: 'accessibility info, contact details',
    },
];
