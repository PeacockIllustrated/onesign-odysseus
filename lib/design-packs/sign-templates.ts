/**
 * SVG Sign Template Generators
 *
 * Generate SVG sign previews with dynamic typography, colours, and graphics
 * Includes dimensions, scale indicators, and realistic content
 */

import { DesignPackData, SignSize, GraphicElement } from './types';
import { getSignDimensions } from './sign-dimensions';
import {
    renderText,
    renderSignBackground,
    renderDimensionLabel,
    renderScaleIndicator,
    renderArrow,
    renderDivider,
    renderIconPlaceholder,
    wrapSVG,
    getSignColors,
    getSignFonts,
} from './sign-renderer';
import { renderGraphicElements } from './icon-renderer';

// =============================================================================
// TEMPLATE GENERATORS
// =============================================================================

/**
 * Generate entrance sign SVG
 */
export function generateEntranceSign(
    data: DesignPackData,
    projectName: string = 'project',
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 800;
    const canvasHeight = 500;
    const signHeight = 400;
    const dimensions = getSignDimensions('entrance', size);

    // Background with accent strip
    const background = renderSignBackground(canvasWidth, signHeight, colors.primary, colors.accent, 12);

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    // Main text - large and prominent
    const mainText = renderText({
        text: projectName,
        bounds: { x: 50, y: 80, width: 700, height: 120 },
        fontFamily: fonts.primaryFamily,
        fontSize: 96,
        fontWeight: fonts.primaryWeight,
        fill: colors.secondary,
        alignment: 'center',
        allowShrink: true,
    });

    // Subtitle text
    const subtitleText = renderText({
        text: 'main entrance',
        bounds: { x: 50, y: 220, width: 700, height: 60 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 28,
        fontWeight: fonts.secondaryWeight,
        fill: colors.secondary,
        alignment: 'center',
        opacity: 0.8,
    });

    // Icon indicator
    const icon = `
    <circle cx="60" cy="340" r="20" stroke="${colors.secondary}" fill="none" stroke-width="2"/>
    <text x="100" y="345" font-family="sans-serif" font-size="14" fill="${colors.secondary}">entrance</text>`;

    // Labels
    const dimensionLabel = renderDimensionLabel('entrance', size, canvasWidth, 440);
    const scaleLabel = renderScaleIndicator(canvasWidth, 465, '1:5');

    return wrapSVG(canvasWidth, canvasHeight, `
        ${background}
        ${graphicsLayer}
        ${mainText}
        ${subtitleText}
        ${icon}
        ${dimensionLabel}
        ${scaleLabel}
    `);
}

/**
 * Generate wayfinding sign SVG
 */
export function generateWayfindingSign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 600;
    const canvasHeight = 380;
    const signHeight = 300;
    const dimensions = getSignDimensions('wayfinding', size);

    // Background
    const background = `<rect fill="${colors.secondary}" width="${canvasWidth}" height="${signHeight}" stroke="${colors.primary}" stroke-width="4"/>`;

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    // Directional arrow
    const arrow = renderArrow(480, 150, 540, 150, colors.primary, 4);

    // Location text
    const locationText = renderText({
        text: 'visitor centre',
        bounds: { x: 60, y: 60, width: 380, height: 70 },
        fontFamily: fonts.primaryFamily,
        fontSize: 48,
        fontWeight: 600,
        fill: colors.primary,
        alignment: 'left',
        allowShrink: true,
    });

    // Distance
    const distanceText = renderText({
        text: '200 metres',
        bounds: { x: 60, y: 140, width: 380, height: 40 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 24,
        fontWeight: fonts.secondaryWeight,
        fill: colors.primary,
        alignment: 'left',
        opacity: 0.7,
    });

    // Accent line
    const accentLine = `<rect fill="${colors.accent}" width="${canvasWidth}" height="6" y="200"/>`;

    // Secondary info with icons
    const infoText = renderText({
        text: '♿ accessible • ☕ café • ℹ information',
        bounds: { x: 60, y: 215, width: 480, height: 50 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 18,
        fontWeight: fonts.secondaryWeight,
        fill: colors.primary,
        alignment: 'left',
        opacity: 0.6,
    });

    // Labels
    const dimensionLabel = renderDimensionLabel('wayfinding', size, canvasWidth, 335);
    const scaleLabel = renderScaleIndicator(canvasWidth, 360, '1:3');

    return wrapSVG(canvasWidth, canvasHeight, `
        ${background}
        ${graphicsLayer}
        ${arrow}
        ${locationText}
        ${distanceText}
        ${accentLine}
        ${infoText}
        ${dimensionLabel}
        ${scaleLabel}
    `);
}

/**
 * Generate information board SVG
 */
export function generateInfoBoardSign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 700;
    const canvasHeight = 600;
    const signHeight = 500;
    const dimensions = getSignDimensions('info_board', size);

    // Background
    const background = `<rect fill="${colors.secondary}" width="${canvasWidth}" height="${signHeight}" stroke="${colors.primary}" stroke-width="3"/>`;

    // Header bar
    const header = `<rect fill="${colors.accent}" width="${canvasWidth}" height="80"/>`;

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    // Title
    const titleText = renderText({
        text: 'about this site',
        bounds: { x: 40, y: 20, width: 620, height: 50 },
        fontFamily: fonts.primaryFamily,
        fontSize: 36,
        fontWeight: fonts.primaryWeight,
        fill: colors.secondary,
        alignment: 'left',
        allowShrink: true,
    });

    // Body content - multi-line paragraph
    const bodyText = renderText({
        text: 'this historic woodland has been carefully managed for over 400 years. the diverse habitats support numerous species of wildlife including badgers, deer, and over 50 bird species.',
        bounds: { x: 40, y: 100, width: 620, height: 100 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 20,
        fontWeight: fonts.secondaryWeight,
        fill: colors.primary,
        alignment: 'left',
        allowShrink: true,
    });

    // Section divider
    const divider = renderDivider(40, 220, 660, 220, colors.accent, 2, 0.3);

    // Features list
    const featuresText = renderText({
        text: '• ancient oak and beech woodland\n• circular walking trails (2-5km)\n• seasonal wildflower meadows',
        bounds: { x: 40, y: 240, width: 620, height: 100 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 18,
        fontWeight: fonts.secondaryWeight,
        fill: colors.primary,
        alignment: 'left',
    });

    // Icon placeholder
    const iconCircle = `<circle cx="350" cy="410" r="40" fill="${colors.accent}" opacity="0.15"/>`;
    const iconArrow = `<path d="M 335 395 L 345 410 L 355 395 M 350 410 L 350 430" stroke="${colors.primary}" stroke-width="2" fill="none"/>`;

    // Labels
    const dimensionLabel = renderDimensionLabel('info_board', size, canvasWidth, 540);
    const scaleLabel = renderScaleIndicator(canvasWidth, 565, '1:4');

    return wrapSVG(canvasWidth, canvasHeight, `
        ${background}
        ${header}
        ${graphicsLayer}
        ${titleText}
        ${bodyText}
        ${divider}
        ${featuresText}
        ${iconCircle}
        ${iconArrow}
        ${dimensionLabel}
        ${scaleLabel}
    `);
}

/**
 * Generate regulatory sign SVG
 */
export function generateRegulatorySign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 400;
    const canvasHeight = 400;
    const dimensions = getSignDimensions('regulatory', size);

    // Background
    const background = `<rect fill="${colors.secondary}" width="${canvasWidth}" height="${canvasHeight}"/>`;

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, canvasHeight, dimensions.width_mm, dimensions.height_mm);

    // Border
    const border = `<rect fill="none" stroke="${colors.primary}" stroke-width="8" x="20" y="20" width="360" height="360" rx="4"/>`;

    // Icon circle with prohibition line
    const icon = `
    <circle cx="200" cy="160" r="80" stroke="${colors.primary}" stroke-width="6" fill="none"/>
    <line x1="160" y1="160" x2="240" y2="160" stroke="${colors.primary}" stroke-width="8" stroke-linecap="round"/>`;

    // Text
    const messageText = renderText({
        text: 'no entry',
        bounds: { x: 50, y: 280, width: 300, height: 60 },
        fontFamily: fonts.primaryFamily,
        fontSize: 32,
        fontWeight: fonts.primaryWeight,
        fill: colors.primary,
        alignment: 'center',
    });

    return wrapSVG(canvasWidth, canvasHeight, `
        ${background}
        ${graphicsLayer}
        ${border}
        ${icon}
        ${messageText}
    `);
}

/**
 * Generate interactive/QR sign SVG
 */
export function generateInteractiveSign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 500;
    const canvasHeight = 600;
    const dimensions = getSignDimensions('interactive', size);

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, canvasHeight, dimensions.width_mm, dimensions.height_mm);

    // Background
    const background = `<rect fill="${colors.secondary}" width="${canvasWidth}" height="${canvasHeight}" stroke="${colors.primary}" stroke-width="3"/>`;

    // Header
    const header = `<rect fill="${colors.accent}" width="${canvasWidth}" height="100"/>`;

    // Title
    const titleText = renderText({
        text: 'scan for info',
        bounds: { x: 50, y: 30, width: 400, height: 50 },
        fontFamily: fonts.primaryFamily,
        fontSize: 36,
        fontWeight: fonts.primaryWeight,
        fill: colors.secondary,
        alignment: 'center',
    });

    // QR Code placeholder (using helper or manual)
    const qrCode = `
    <rect x="150" y="180" width="200" height="200" fill="${colors.primary}"/>
    <rect x="160" y="190" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="210" y="190" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="160" y="240" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="310" y="190" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="310" y="240" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="260" y="340" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="310" y="340" width="30" height="30" fill="${colors.secondary}"/>
    <rect x="160" y="340" width="30" height="30" fill="${colors.secondary}"/>`;

    // Instructions
    const instructionText = renderText({
        text: 'point your camera at this code\nto access digital trail guide',
        bounds: { x: 50, y: 420, width: 400, height: 80 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 20,
        fontWeight: fonts.secondaryWeight,
        fill: colors.primary,
        alignment: 'center',
        allowShrink: true,
    });

    return wrapSVG(canvasWidth, canvasHeight, `
        ${background}
        ${header}
        ${graphicsLayer}
        ${titleText}
        ${qrCode}
        ${instructionText}
    `);
}

/**
 * Generate building fascia sign SVG
 */
export function generateFasciaSign(
    data: DesignPackData,
    projectName: string = 'project',
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 1000;
    const canvasHeight = 200;
    const dimensions = getSignDimensions('fascia', size);

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, canvasHeight, dimensions.width_mm, dimensions.height_mm);

    // Background (building wall)
    const buildingWall = `<rect fill="#8B7355" width="${canvasWidth}" height="${canvasHeight}"/>`;

    // Sign panel
    const signPanel = `<rect fill="${colors.primary}" x="100" y="50" width="800" height="100" rx="2"/>`;

    // Text with letter spacing
    const brandText = renderText({
        text: projectName,
        bounds: { x: 100, y: 60, width: 800, height: 80 },
        fontFamily: fonts.primaryFamily,
        fontSize: 64,
        fontWeight: fonts.primaryWeight,
        fill: colors.secondary,
        alignment: 'center',
        letterSpacing: 4,
        allowShrink: true,
    });

    return wrapSVG(canvasWidth, canvasHeight, `
        ${buildingWall}
        ${signPanel}
        ${graphicsLayer}
        ${brandText}
    `);
}

/**
 * Generate freestanding totem sign SVG
 */
export function generateTotemSign(
    data: DesignPackData,
    projectName: string = 'project',
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const colors = getSignColors(data);
    const fonts = getSignFonts(data);
    const canvasWidth = 400;
    const canvasHeight = 800;
    const dimensions = getSignDimensions('totem', size);

    // Post
    const post = `<rect fill="#6B5D52" x="170" y="500" width="60" height="300"/>`;

    // Main panel
    const mainPanel = `<rect fill="${colors.primary}" x="50" y="50" width="300" height="500" rx="8"/>`;

    // Accent top
    const accentTop = `<rect fill="${colors.accent}" x="50" y="50" width="300" height="80" rx="8" ry="0"/>`;

    // Render graphic elements
    const graphicsLayer = renderGraphicElements(graphics, canvasWidth, canvasHeight, dimensions.width_mm, dimensions.height_mm);

    // Brand text
    const brandText = renderText({
        text: projectName,
        bounds: { x: 50, y: 60, width: 300, height: 60 },
        fontFamily: fonts.primaryFamily,
        fontSize: 42,
        fontWeight: fonts.primaryWeight,
        fill: colors.secondary,
        alignment: 'center',
        allowShrink: true,
    });

    // Directions
    const directions = renderText({
        text: 'car park →\ncafé →\ntoilets ←\nshop ←',
        bounds: { x: 80, y: 180, width: 240, height: 250 },
        fontFamily: fonts.secondaryFamily,
        fontSize: 28,
        fontWeight: fonts.secondaryWeight,
        fill: colors.secondary,
        alignment: 'left',
        allowShrink: true,
    });

    return wrapSVG(canvasWidth, canvasHeight, `
        ${post}
        ${mainPanel}
        ${accentTop}
        ${graphicsLayer}
        ${brandText}
        ${directions}
    `);
}

/**
 * Generate door plate sign SVG
 */
export function generateDoorPlateSign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const primary = data.colours?.primary || { hex: '#000000', name: 'black' };
    const secondary = data.colours?.secondary || { hex: '#FFFFFF', name: 'white' };
    const primaryFont = data.typography?.primary_font?.family || 'sans-serif';
    const secondaryFont = data.typography?.secondary_font?.family || 'sans-serif';
    const dimensions = getSignDimensions('door_plate', size);
    const canvasWidth = 400;
    const canvasHeight = 250;
    const signHeight = 150;

    // Render graphic elements
    const graphicsSVG = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    return `
<svg width="400" height="250" xmlns="http://www.w3.org/2000/svg">
    <!-- Sign Panel -->
    <rect fill="${secondary.hex}" width="400" height="150" stroke="${primary.hex}" stroke-width="2" rx="4"/>

    <!-- Graphics -->
    ${graphicsSVG}

    <!-- Room number -->
    <text
        x="200"
        y="60"
        font-family="${primaryFont}, sans-serif"
        font-weight="700"
        fill="${primary.hex}"
        font-size="48"
        text-anchor="middle"
        dominant-baseline="middle"
    >
        office 201
    </text>

    <!-- Room name -->
    <text
        x="200"
        y="110"
        font-family="${secondaryFont}, sans-serif"
        font-size="20"
        fill="${primary.hex}"
        text-anchor="middle"
        opacity="0.7"
    >
        meeting room
    </text>

    <!-- Dimensions -->
    <text x="200" y="185" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">
        ${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance
    </text>

    <!-- Scale indicator -->
    <text x="200" y="210" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">
        preview shown at 1:1 scale
    </text>
</svg>`.trim();
}

/**
 * Generate parking sign SVG
 */
export function generateParkingSign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const primary = data.colours?.primary || { hex: '#000000', name: 'black' };
    const secondary = data.colours?.secondary || { hex: '#FFFFFF', name: 'white' };
    const primaryFont = data.typography?.primary_font?.family || 'sans-serif';
    const accent = data.colours?.accents?.[0]?.hex || '#0066CC';
    const dimensions = getSignDimensions('parking_sign', size);
    const canvasWidth = 700;
    const canvasHeight = 550;
    const signHeight = 450;

    // Render graphic elements
    const graphicsSVG = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    return `
<svg width="700" height="550" xmlns="http://www.w3.org/2000/svg">
    <!-- Sign Panel -->
    <rect fill="${accent}" width="700" height="450" stroke="${primary.hex}" stroke-width="4" rx="6"/>

    <!-- Graphics -->
    ${graphicsSVG}

    <!-- Large P symbol -->
    <circle cx="350" cy="150" r="90" fill="${secondary.hex}"/>
    <text
        x="350"
        y="180"
        font-family="${primaryFont}, sans-serif"
        font-weight="700"
        fill="${accent}"
        font-size="120"
        text-anchor="middle"
        dominant-baseline="middle"
    >
        P
    </text>

    <!-- Parking area name -->
    <text
        x="350"
        y="310"
        font-family="${primaryFont}, sans-serif"
        font-weight="600"
        fill="${secondary.hex}"
        font-size="42"
        text-anchor="middle"
    >
        visitor parking
    </text>

    <!-- Arrow indicator -->
    <path
        d="M 300 370 L 400 370 L 375 350 M 400 370 L 375 390"
        stroke="${secondary.hex}"
        stroke-width="6"
        fill="none"
        stroke-linecap="round"
    />

    <!-- Dimensions -->
    <text x="350" y="485" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">
        ${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance
    </text>

    <!-- Scale indicator -->
    <text x="350" y="510" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">
        preview shown at 1:3 scale
    </text>
</svg>`.trim();
}

/**
 * Generate safety warning sign SVG
 */
export function generateSafetyWarningSign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const warningColor = '#FFB300'; // Warning yellow/amber
    const primary = data.colours?.primary || { hex: '#000000', name: 'black' };
    const secondary = data.colours?.secondary || { hex: '#FFFFFF', name: 'white' };
    const primaryFont = data.typography?.primary_font?.family || 'sans-serif';
    const dimensions = getSignDimensions('safety_warning', size);
    const canvasWidth = 450;
    const canvasHeight = 520;
    const signHeight = 420;

    // Render graphic elements
    const graphicsSVG = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    return `
<svg width="450" height="520" xmlns="http://www.w3.org/2000/svg">
    <!-- Sign Panel -->
    <rect fill="${warningColor}" width="450" height="420" stroke="${primary.hex}" stroke-width="4" rx="4"/>

    <!-- Graphics -->
    ${graphicsSVG}

    <!-- Warning triangle border -->
    <path
        d="M 225 60 L 360 240 L 90 240 Z"
        fill="none"
        stroke="${primary.hex}"
        stroke-width="8"
    />

    <!-- Exclamation mark -->
    <rect x="215" y="110" width="20" height="80" fill="${primary.hex}" rx="2"/>
    <rect x="215" y="210" width="20" height="20" fill="${primary.hex}" rx="2"/>

    <!-- Warning text -->
    <text
        x="225"
        y="310"
        font-family="${primaryFont}, sans-serif"
        font-weight="700"
        fill="${primary.hex}"
        font-size="36"
        text-anchor="middle"
    >
        caution
    </text>

    <!-- Details -->
    <text
        x="225"
        y="360"
        font-family="sans-serif"
        font-size="20"
        fill="${primary.hex}"
        text-anchor="middle"
        opacity="0.9"
    >
        hazard ahead
    </text>

    <!-- Dimensions -->
    <text x="225" y="455" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">
        ${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance
    </text>

    <!-- Scale indicator -->
    <text x="225" y="480" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">
        preview shown at 1:2 scale
    </text>
</svg>`.trim();
}

/**
 * Generate accessibility sign SVG
 */
export function generateAccessibilitySign(
    data: DesignPackData,
    projectName?: string,
    size: SignSize = 'medium',
    graphics: GraphicElement[] = []
): string {
    const primary = data.colours?.primary || { hex: '#000000', name: 'black' };
    const secondary = data.colours?.secondary || { hex: '#FFFFFF', name: 'white' };
    const accessBlue = '#0066CC';
    const primaryFont = data.typography?.primary_font?.family || 'sans-serif';
    const dimensions = getSignDimensions('accessibility', size);
    const canvasWidth = 550;
    const canvasHeight = 450;
    const signHeight = 350;

    // Render graphic elements
    const graphicsSVG = renderGraphicElements(graphics, canvasWidth, signHeight, dimensions.width_mm, dimensions.height_mm);

    return `
<svg width="550" height="450" xmlns="http://www.w3.org/2000/svg">
    <!-- Sign Panel -->
    <rect fill="${accessBlue}" width="550" height="350" stroke="${primary.hex}" stroke-width="3" rx="4"/>

    <!-- Graphics -->
    ${graphicsSVG}

    <!-- Wheelchair symbol circle -->
    <circle cx="160" cy="140" r="70" fill="${secondary.hex}"/>

    <!-- Wheelchair icon (simplified) -->
    <g fill="${accessBlue}">
        <!-- Head -->
        <circle cx="160" cy="110" r="12"/>
        <!-- Body and arms -->
        <rect x="152" y="125" width="16" height="30" rx="2"/>
        <rect x="140" y="130" width="40" height="8" rx="2"/>
        <!-- Wheels -->
        <circle cx="160" cy="165" r="25" fill="none" stroke="${accessBlue}" stroke-width="6"/>
        <circle cx="165" cy="145" r="8"/>
    </g>

    <!-- Accessible entrance text -->
    <text
        x="350"
        y="130"
        font-family="${primaryFont}, sans-serif"
        font-weight="700"
        fill="${secondary.hex}"
        font-size="40"
        text-anchor="middle"
    >
        accessible
    </text>

    <text
        x="350"
        y="180"
        font-family="${primaryFont}, sans-serif"
        font-weight="600"
        fill="${secondary.hex}"
        font-size="36"
        text-anchor="middle"
    >
        entrance
    </text>

    <!-- Arrow -->
    <path
        d="M 220 250 L 480 250 L 455 225 M 480 250 L 455 275"
        stroke="${secondary.hex}"
        stroke-width="6"
        fill="none"
        stroke-linecap="round"
    />

    <!-- Dimensions -->
    <text x="275" y="385" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">
        ${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance
    </text>

    <!-- Scale indicator -->
    <text x="275" y="410" font-family="sans-serif" font-size="11" fill="#999" text-anchor="middle">
        preview shown at 1:2 scale
    </text>
</svg>`.trim();
}

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

export type SignTemplateType = 'entrance' | 'wayfinding' | 'info_board' | 'regulatory' | 'interactive' | 'fascia' | 'totem' | 'door_plate' | 'parking_sign' | 'safety_warning' | 'accessibility';

export const SIGN_TEMPLATE_GENERATORS: Record<
    SignTemplateType,
    (data: DesignPackData, projectName?: string, size?: SignSize, graphics?: GraphicElement[]) => string
> = {
    entrance: generateEntranceSign,
    wayfinding: generateWayfindingSign,
    info_board: generateInfoBoardSign,
    regulatory: generateRegulatorySign,
    interactive: generateInteractiveSign,
    fascia: generateFasciaSign,
    totem: generateTotemSign,
    door_plate: generateDoorPlateSign,
    parking_sign: generateParkingSign,
    safety_warning: generateSafetyWarningSign,
    accessibility: generateAccessibilitySign,
};

export const SIGN_TEMPLATE_LABELS: Record<SignTemplateType, string> = {
    entrance: 'entrance sign',
    wayfinding: 'wayfinding / directional',
    info_board: 'information board',
    regulatory: 'regulatory sign',
    interactive: 'interactive / qr sign',
    fascia: 'building fascia',
    totem: 'freestanding totem',
    door_plate: 'door plate / nameplate',
    parking_sign: 'parking signage',
    safety_warning: 'safety warning',
    accessibility: 'accessibility sign',
};
