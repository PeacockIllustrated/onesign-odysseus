/**
 * Sign SVG Renderer
 *
 * Provides utilities for generating SVG elements for signage with intelligent
 * text layout, proper typography, and realistic styling.
 *
 * All sign templates use these utilities for consistent rendering.
 */

import { layoutTextBlock, getSVGTextAnchor, type TextAlignment } from './text-layout';
import type { DesignPackData, SignSize } from './types';
import { getSignDimensions } from './sign-dimensions';

/**
 * Options for rendering text in SVG
 */
export interface RenderTextOptions {
  /** Text to render */
  text: string;
  /** Bounding box for text */
  bounds: { x: number; y: number; width: number; height: number };
  /** Font family */
  fontFamily: string;
  /** Font size (will be auto-sized if allowShrink=true) */
  fontSize: number;
  /** Font weight */
  fontWeight: number;
  /** Text color */
  fill: string;
  /** Text alignment (default: 'center') */
  alignment?: TextAlignment;
  /** Allow font size reduction (default: true) */
  allowShrink?: boolean;
  /** Opacity (default: 1) */
  opacity?: number;
  /** Letter spacing in pixels (default: 0) */
  letterSpacing?: number;
}

/**
 * Render multi-line text as SVG <text> elements
 *
 * This is the core function for all text rendering in signs.
 * Uses the layout engine to calculate wrapping and positioning.
 *
 * @param options - Text rendering options
 * @returns SVG string containing properly laid out text elements
 *
 * @example
 * const svg = renderText({
 *   text: "Welcome to the visitor centre",
 *   bounds: { x: 50, y: 50, width: 700, height: 200 },
 *   fontFamily: "Montserrat",
 *   fontSize: 96,
 *   fontWeight: 700,
 *   fill: "#FFFFFF",
 *   alignment: "center"
 * });
 */
export function renderText(options: RenderTextOptions): string {
  const {
    text,
    bounds,
    fontFamily,
    fontSize,
    fontWeight,
    fill,
    alignment = 'center',
    allowShrink = true,
    opacity = 1,
    letterSpacing = 0,
  } = options;

  if (!text) return '';

  // Calculate layout
  const layout = layoutTextBlock(
    text,
    { width: bounds.width, height: bounds.height },
    fontFamily,
    fontSize,
    fontWeight,
    { alignment, allowShrink, verticalAlign: 'middle' }
  );

  // Generate SVG <text> elements for each line
  const textElements = layout.lines
    .map((line, index) => {
      const y = bounds.y + layout.linePositions[index];
      let x: number;

      // Calculate x position based on alignment
      switch (alignment) {
        case 'left':
          x = bounds.x;
          break;
        case 'right':
          x = bounds.x + bounds.width;
          break;
        case 'center':
        default:
          x = bounds.x + bounds.width / 2;
          break;
      }

      return `
    <text
      x="${x}"
      y="${y}"
      font-family="${fontFamily}, sans-serif"
      font-size="${layout.fontSize}"
      font-weight="${fontWeight}"
      fill="${fill}"
      text-anchor="${getSVGTextAnchor(alignment)}"
      dominant-baseline="middle"
      opacity="${opacity}"
      ${letterSpacing > 0 ? `letter-spacing="${letterSpacing}"` : ''}
    >${escapeXML(line)}</text>`;
    })
    .join('');

  return textElements;
}

/**
 * Render a sign background rectangle with optional accent strip
 *
 * @param width - Sign width in pixels
 * @param height - Sign height in pixels
 * @param backgroundColor - Background color
 * @param accentColor - Optional accent strip color
 * @param accentHeight - Height of accent strip (default: 12px)
 * @returns SVG string for background elements
 */
export function renderSignBackground(
  width: number,
  height: number,
  backgroundColor: string,
  accentColor?: string,
  accentHeight: number = 12
): string {
  let svg = `
  <!-- Sign background -->
  <rect fill="${backgroundColor}" width="${width}" height="${height}" stroke="#ddd" stroke-width="2"/>`;

  if (accentColor) {
    svg += `
  <!-- Accent strip -->
  <rect fill="${accentColor}" width="${width}" height="${accentHeight}" y="0"/>`;
  }

  return svg;
}

/**
 * Render dimension labels for sign preview
 *
 * @param signType - Type of sign
 * @param size - Sign size
 * @param canvasWidth - SVG canvas width
 * @param yPosition - Y position for label
 * @returns SVG string for dimension labels
 */
export function renderDimensionLabel(
  signType: string,
  size: SignSize,
  canvasWidth: number,
  yPosition: number
): string {
  const dimensions = getSignDimensions(signType as any, size);

  return `
  <text
    x="${canvasWidth / 2}"
    y="${yPosition}"
    font-family="monospace"
    font-size="12"
    fill="#666"
    text-anchor="middle"
  >${dimensions.label} • ${dimensions.typical_viewing_distance} viewing distance</text>`;
}

/**
 * Render scale indicator label
 *
 * @param canvasWidth - SVG canvas width
 * @param yPosition - Y position for label
 * @param scale - Scale ratio (e.g., "1:5")
 * @returns SVG string for scale indicator
 */
export function renderScaleIndicator(
  canvasWidth: number,
  yPosition: number,
  scale: string
): string {
  return `
  <text
    x="${canvasWidth / 2}"
    y="${yPosition}"
    font-family="sans-serif"
    font-size="11"
    fill="#999"
    text-anchor="middle"
  >preview shown at ${scale} scale</text>`;
}

/**
 * Generate a complete SVG wrapper
 *
 * @param width - SVG width
 * @param height - SVG height
 * @param content - Inner SVG content
 * @param filters - Optional filter definitions
 * @returns Complete SVG string
 */
export function wrapSVG(
  width: number,
  height: number,
  content: string,
  filters?: string
): string {
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${filters ? `<defs>${filters}</defs>` : ''}
  ${content}
</svg>`.trim();
}

/**
 * Escape special XML characters in text
 *
 * Prevents XSS and rendering errors from user-provided text
 *
 * @param text - Text to escape
 * @returns Escaped text safe for XML
 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get colors from design pack data with fallbacks
 *
 * @param data - Design pack data
 * @returns Color object with primary, secondary, accent
 */
export function getSignColors(data: DesignPackData): {
  primary: string;
  secondary: string;
  accent: string;
} {
  return {
    primary: data.colours?.primary?.hex || '#000000',
    secondary: data.colours?.secondary?.hex || '#FFFFFF',
    accent: data.colours?.accents?.[0]?.hex || data.colours?.primary?.hex || '#000000',
  };
}

/**
 * Get fonts from design pack data with fallbacks
 *
 * @param data - Design pack data
 * @returns Font object with primary and secondary fonts
 */
export function getSignFonts(data: DesignPackData): {
  primaryFamily: string;
  primaryWeight: number;
  secondaryFamily: string;
  secondaryWeight: number;
} {
  return {
    primaryFamily: data.typography?.primary_font?.family || 'sans-serif',
    primaryWeight: data.typography?.primary_font?.weight || 700,
    secondaryFamily: data.typography?.secondary_font?.family || 'sans-serif',
    secondaryWeight: data.typography?.secondary_font?.weight || 400,
  };
}

/**
 * Render an icon placeholder (simple circle or shape)
 *
 * @param x - X position
 * @param y - Y position
 * @param radius - Icon radius
 * @param color - Icon color
 * @param type - Icon type ('circle' | 'square')
 * @returns SVG string for icon placeholder
 */
export function renderIconPlaceholder(
  x: number,
  y: number,
  radius: number,
  color: string,
  type: 'circle' | 'square' = 'circle'
): string {
  if (type === 'circle') {
    return `<circle cx="${x}" cy="${y}" r="${radius}" stroke="${color}" fill="none" stroke-width="2"/>`;
  } else {
    const size = radius * 2;
    return `<rect x="${x - radius}" y="${y - radius}" width="${size}" height="${size}" stroke="${color}" fill="none" stroke-width="2"/>`;
  }
}

/**
 * Render a directional arrow
 *
 * @param startX - Arrow start X
 * @param startY - Arrow start Y
 * @param endX - Arrow end X
 * @param endY - Arrow end Y
 * @param color - Arrow color
 * @param strokeWidth - Line width (default: 4)
 * @returns SVG string for arrow
 */
export function renderArrow(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  strokeWidth: number = 4
): string {
  const arrowSize = 30;
  const angle = Math.atan2(endY - startY, endX - startX);

  // Calculate arrowhead points
  const arrowPoint1X = endX - arrowSize * Math.cos(angle - Math.PI / 6);
  const arrowPoint1Y = endY - arrowSize * Math.sin(angle - Math.PI / 6);
  const arrowPoint2X = endX - arrowSize * Math.cos(angle + Math.PI / 6);
  const arrowPoint2Y = endY - arrowSize * Math.sin(angle + Math.PI / 6);

  return `
  <path
    d="M ${startX} ${startY} L ${endX} ${endY} M ${endX} ${endY} L ${arrowPoint1X} ${arrowPoint1Y} M ${endX} ${endY} L ${arrowPoint2X} ${arrowPoint2Y}"
    stroke="${color}"
    stroke-width="${strokeWidth}"
    fill="none"
    stroke-linecap="round"
  />`;
}

/**
 * Render a dividing line
 *
 * @param x1 - Start X
 * @param y1 - Start Y
 * @param x2 - End X
 * @param y2 - End Y
 * @param color - Line color
 * @param strokeWidth - Line width (default: 2)
 * @param opacity - Line opacity (default: 0.3)
 * @returns SVG string for divider line
 */
export function renderDivider(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  strokeWidth: number = 2,
  opacity: number = 0.3
): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
}

/**
 * Generate a QR code placeholder pattern
 *
 * @param x - X position
 * @param y - Y position
 * @param size - QR code size
 * @param color - Pattern color
 * @returns SVG string for QR placeholder
 */
export function renderQRPlaceholder(
  x: number,
  y: number,
  size: number,
  color: string
): string {
  const gridSize = 8;
  const cellSize = size / gridSize;
  let cells = '';

  // Generate pseudo-random pattern
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Simple pattern: checkerboard with some randomness
      if ((row + col) % 2 === 0 || (row * col) % 3 === 0) {
        cells += `<rect x="${x + col * cellSize}" y="${y + row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`;
      }
    }
  }

  return `
  <g>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="white" stroke="${color}" stroke-width="2"/>
    ${cells}
  </g>`;
}
