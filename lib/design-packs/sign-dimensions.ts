/**
 * Sign Dimensions and Specifications
 *
 * Real-world dimensions for different sign types and sizes
 * All dimensions in millimeters (mm)
 */

import { SignType, SignSize } from './types';

export interface SignDimensions {
    width_mm: number;
    height_mm: number;
    label: string;
    typical_viewing_distance: string;
    mounting: string;
}

/**
 * Sign dimensions by type and size
 */
export const SIGN_DIMENSIONS: Record<SignType, Record<SignSize, SignDimensions>> = {
    entrance: {
        small: {
            width_mm: 600,
            height_mm: 400,
            label: '600mm × 400mm',
            typical_viewing_distance: '5-10 meters',
            mounting: 'wall mounted or post mounted',
        },
        medium: {
            width_mm: 1200,
            height_mm: 800,
            label: '1200mm × 800mm',
            typical_viewing_distance: '10-20 meters',
            mounting: 'wall mounted or freestanding',
        },
        large: {
            width_mm: 2000,
            height_mm: 1200,
            label: '2000mm × 1200mm',
            typical_viewing_distance: '20-50 meters',
            mounting: 'building fascia or monument sign',
        },
    },
    wayfinding: {
        small: {
            width_mm: 400,
            height_mm: 300,
            label: '400mm × 300mm',
            typical_viewing_distance: '3-8 meters',
            mounting: 'wall mounted or post mounted',
        },
        medium: {
            width_mm: 600,
            height_mm: 450,
            label: '600mm × 450mm',
            typical_viewing_distance: '8-15 meters',
            mounting: 'wall mounted or post mounted',
        },
        large: {
            width_mm: 900,
            height_mm: 600,
            label: '900mm × 600mm',
            typical_viewing_distance: '15-25 meters',
            mounting: 'post mounted or overhead',
        },
    },
    info_board: {
        small: {
            width_mm: 600,
            height_mm: 800,
            label: '600mm × 800mm',
            typical_viewing_distance: '1-3 meters',
            mounting: 'wall mounted or lectern style',
        },
        medium: {
            width_mm: 900,
            height_mm: 1200,
            label: '900mm × 1200mm',
            typical_viewing_distance: '2-5 meters',
            mounting: 'wall mounted or freestanding panel',
        },
        large: {
            width_mm: 1500,
            height_mm: 2000,
            label: '1500mm × 2000mm',
            typical_viewing_distance: '3-10 meters',
            mounting: 'freestanding interpretation panel',
        },
    },
    regulatory: {
        small: {
            width_mm: 300,
            height_mm: 300,
            label: '300mm × 300mm',
            typical_viewing_distance: '3-5 meters',
            mounting: 'wall mounted or post mounted',
        },
        medium: {
            width_mm: 450,
            height_mm: 450,
            label: '450mm × 450mm',
            typical_viewing_distance: '5-10 meters',
            mounting: 'wall mounted or post mounted',
        },
        large: {
            width_mm: 600,
            height_mm: 600,
            label: '600mm × 600mm',
            typical_viewing_distance: '10-15 meters',
            mounting: 'post mounted or overhead',
        },
    },
    interactive: {
        small: {
            width_mm: 400,
            height_mm: 600,
            label: '400mm × 600mm',
            typical_viewing_distance: '1-2 meters',
            mounting: 'wall mounted at accessible height',
        },
        medium: {
            width_mm: 600,
            height_mm: 900,
            label: '600mm × 900mm',
            typical_viewing_distance: '1-3 meters',
            mounting: 'wall or post mounted',
        },
        large: {
            width_mm: 800,
            height_mm: 1200,
            label: '800mm × 1200mm',
            typical_viewing_distance: '2-5 meters',
            mounting: 'freestanding kiosk style',
        },
    },
    fascia: {
        small: {
            width_mm: 2000,
            height_mm: 400,
            label: '2000mm × 400mm',
            typical_viewing_distance: '10-20 meters',
            mounting: 'building fascia',
        },
        medium: {
            width_mm: 3000,
            height_mm: 600,
            label: '3000mm × 600mm',
            typical_viewing_distance: '15-30 meters',
            mounting: 'building fascia',
        },
        large: {
            width_mm: 5000,
            height_mm: 800,
            label: '5000mm × 800mm',
            typical_viewing_distance: '20-50 meters',
            mounting: 'building fascia or rooftop',
        },
    },
    totem: {
        small: {
            width_mm: 600,
            height_mm: 1800,
            label: '600mm × 1800mm',
            typical_viewing_distance: '5-15 meters',
            mounting: 'freestanding post mounted',
        },
        medium: {
            width_mm: 800,
            height_mm: 2400,
            label: '800mm × 2400mm',
            typical_viewing_distance: '10-25 meters',
            mounting: 'freestanding monument',
        },
        large: {
            width_mm: 1200,
            height_mm: 3000,
            label: '1200mm × 3000mm',
            typical_viewing_distance: '15-40 meters',
            mounting: 'freestanding monument or pylon',
        },
    },
    // Phase 1 additions (4 new types)
    door_plate: {
        small: {
            width_mm: 200,
            height_mm: 100,
            label: '200mm × 100mm',
            typical_viewing_distance: '1-3 meters',
            mounting: 'wall mounted at door height',
        },
        medium: {
            width_mm: 300,
            height_mm: 150,
            label: '300mm × 150mm',
            typical_viewing_distance: '2-5 meters',
            mounting: 'wall mounted at door height',
        },
        large: {
            width_mm: 400,
            height_mm: 200,
            label: '400mm × 200mm',
            typical_viewing_distance: '3-8 meters',
            mounting: 'wall mounted or door mounted',
        },
    },
    parking_sign: {
        small: {
            width_mm: 600,
            height_mm: 450,
            label: '600mm × 450mm',
            typical_viewing_distance: '5-10 meters',
            mounting: 'post mounted or wall mounted',
        },
        medium: {
            width_mm: 900,
            height_mm: 600,
            label: '900mm × 600mm',
            typical_viewing_distance: '10-20 meters',
            mounting: 'post mounted or overhead',
        },
        large: {
            width_mm: 1200,
            height_mm: 900,
            label: '1200mm × 900mm',
            typical_viewing_distance: '20-40 meters',
            mounting: 'freestanding or overhead gantry',
        },
    },
    safety_warning: {
        small: {
            width_mm: 300,
            height_mm: 300,
            label: '300mm × 300mm',
            typical_viewing_distance: '3-5 meters',
            mounting: 'wall or post mounted',
        },
        medium: {
            width_mm: 450,
            height_mm: 450,
            label: '450mm × 450mm',
            typical_viewing_distance: '5-10 meters',
            mounting: 'wall or post mounted',
        },
        large: {
            width_mm: 600,
            height_mm: 600,
            label: '600mm × 600mm',
            typical_viewing_distance: '10-15 meters',
            mounting: 'prominent wall or post position',
        },
    },
    accessibility: {
        small: {
            width_mm: 300,
            height_mm: 200,
            label: '300mm × 200mm',
            typical_viewing_distance: '2-5 meters',
            mounting: 'wall mounted at accessible height',
        },
        medium: {
            width_mm: 450,
            height_mm: 300,
            label: '450mm × 300mm',
            typical_viewing_distance: '5-10 meters',
            mounting: 'wall mounted at accessible height',
        },
        large: {
            width_mm: 600,
            height_mm: 400,
            label: '600mm × 400mm',
            typical_viewing_distance: '10-15 meters',
            mounting: 'prominent wall or post position',
        },
    },
};

/**
 * Get dimensions for a specific sign type and size
 */
export function getSignDimensions(type: SignType, size: SignSize): SignDimensions {
    return SIGN_DIMENSIONS[type][size];
}

/**
 * Get all sizes for a sign type
 */
export function getSignSizes(type: SignType): SignSize[] {
    return ['small', 'medium', 'large'];
}

/**
 * Default sign size for new signs
 */
export const DEFAULT_SIGN_SIZE: SignSize = 'medium';

/**
 * Typical letter heights for readability at different viewing distances
 * Based on signage industry standards
 */
export const LETTER_HEIGHT_GUIDE = {
    '1-3m': {
        min_letter_height_mm: 25,
        max_letter_height_mm: 50,
        usage: 'close reading distance (info boards, detailed text)',
    },
    '3-8m': {
        min_letter_height_mm: 50,
        max_letter_height_mm: 100,
        usage: 'standard wayfinding and identification',
    },
    '8-15m': {
        min_letter_height_mm: 100,
        max_letter_height_mm: 200,
        usage: 'directional signage and building identification',
    },
    '15-30m': {
        min_letter_height_mm: 200,
        max_letter_height_mm: 400,
        usage: 'large format signage and fascia',
    },
    '30m+': {
        min_letter_height_mm: 400,
        max_letter_height_mm: 1000,
        usage: 'monument signs and architectural lettering',
    },
};

/**
 * Sign specification notes
 */
export const SIGN_SPEC_NOTES = {
    general: [
        'all dimensions are external measurements',
        'allow 50-100mm clearance for mounting brackets',
        'letter heights based on viewing distance and RNIB guidelines',
        'accessibility: minimum contrast ratio 70% for outdoor signs',
    ],
    materials: [
        'specify substrate thickness (typically 3-10mm)',
        'consider UV resistance for outdoor applications',
        'weatherproofing required for external mounting',
        'anti-graffiti coating recommended for accessible areas',
    ],
    installation: [
        'confirm mounting surface load capacity',
        'ensure adequate lighting for 24-hour visibility',
        'maintain minimum height clearances per building codes',
        'consider maintenance access for cleaning and updates',
    ],
};
