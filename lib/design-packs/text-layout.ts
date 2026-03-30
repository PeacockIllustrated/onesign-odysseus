/**
 * Text Layout Engine
 *
 * Provides multi-line text layout with proper leading, alignment, and positioning.
 * Uses typography best practices for signage (1.2-1.5x line height).
 *
 * Builds on top of text-measurement.ts to provide complete layout calculations
 * for SVG text rendering.
 */

import {
  wrapTextToLines,
  calculateMultiLineFitSize,
  calculateTextMetrics,
  measureText,
} from './text-measurement';

/**
 * Text alignment options
 */
export type TextAlignment = 'left' | 'center' | 'right';

/**
 * Text block represents a fully laid-out piece of text
 * with lines, positioning, and styling information
 */
export interface TextBlock {
  /** Array of text lines after wrapping */
  lines: string[];
  /** Font size used (may be reduced from requested if allowShrink=true) */
  fontSize: number;
  /** Line height in pixels (fontSize * lineHeightMultiplier) */
  lineHeight: number;
  /** Total height of text block in pixels */
  totalHeight: number;
  /** Alignment of text */
  alignment: TextAlignment;
  /** Y-positions for each line (top of text baseline) */
  linePositions: number[];
  /** Whether text was shrunk to fit */
  wasShrunk: boolean;
  /** Whether text overflows despite shrinking */
  overflows: boolean;
}

/**
 * Options for laying out a text block
 */
export interface LayoutTextBlockOptions {
  /** Text alignment (default: 'center') */
  alignment?: TextAlignment;
  /** Line height as multiple of font size (default: 1.3 for signage) */
  lineHeightMultiplier?: number;
  /** Allow font size reduction to fit text (default: true) */
  allowShrink?: boolean;
  /** Minimum font size when shrinking (default: 14px) */
  minFontSize?: number;
  /** Vertical alignment within bounds: 'top' | 'middle' | 'bottom' (default: 'middle') */
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

/**
 * Calculate multi-line text layout with proper leading and alignment
 *
 * This is the primary layout function used for all signage text rendering.
 * It handles word wrapping, font sizing, line positioning, and alignment.
 *
 * @param text - The text to layout
 * @param bounds - Maximum width and height in pixels
 * @param fontFamily - Font family name
 * @param requestedFontSize - Desired font size in pixels
 * @param fontWeight - Font weight (100-900)
 * @param options - Layout options
 * @returns Complete text block with positioning data
 *
 * @example
 * const block = layoutTextBlock(
 *   "Welcome to the visitor centre",
 *   { width: 700, height: 200 },
 *   "Montserrat",
 *   96,
 *   700,
 *   { alignment: 'center', allowShrink: true }
 * );
 *
 * // Use block.lines and block.linePositions for SVG rendering
 * block.lines.forEach((line, i) => {
 *   console.log(`Line ${i}: "${line}" at y=${block.linePositions[i]}`);
 * });
 */
export function layoutTextBlock(
  text: string,
  bounds: { width: number; height: number },
  fontFamily: string,
  requestedFontSize: number,
  fontWeight: number,
  options: LayoutTextBlockOptions = {}
): TextBlock {
  const {
    alignment = 'center',
    lineHeightMultiplier = 1.3,
    allowShrink = true,
    minFontSize = 14,
    verticalAlign = 'middle',
  } = options;

  let fontSize = requestedFontSize;
  let wasShrunk = false;

  // If shrinking is allowed, find optimal font size
  if (allowShrink) {
    const optimalSize = calculateMultiLineFitSize(
      text,
      bounds.width,
      bounds.height,
      fontFamily,
      fontWeight,
      minFontSize,
      requestedFontSize,
      lineHeightMultiplier
    );

    if (optimalSize < requestedFontSize) {
      fontSize = optimalSize;
      wasShrunk = true;
    }
  }

  // Calculate text metrics with final font size
  const metrics = calculateTextMetrics(
    text,
    bounds.width,
    bounds.height,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeightMultiplier
  );

  // Calculate line positions
  const linePositions = calculateLinePositions(
    metrics.lineCount,
    metrics.lineHeight,
    bounds.height,
    verticalAlign
  );

  return {
    lines: metrics.lines,
    fontSize,
    lineHeight: metrics.lineHeight,
    totalHeight: metrics.totalHeight,
    alignment,
    linePositions,
    wasShrunk,
    overflows: metrics.overflows,
  };
}

/**
 * Calculate Y-positions for each line based on vertical alignment
 *
 * @param lineCount - Number of lines
 * @param lineHeight - Height of each line in pixels
 * @param boundsHeight - Total available height
 * @param verticalAlign - Vertical alignment option
 * @returns Array of Y-positions (one per line)
 */
function calculateLinePositions(
  lineCount: number,
  lineHeight: number,
  boundsHeight: number,
  verticalAlign: 'top' | 'middle' | 'bottom'
): number[] {
  const totalTextHeight = lineCount * lineHeight;
  const positions: number[] = [];

  let startY: number;

  switch (verticalAlign) {
    case 'top':
      startY = lineHeight; // First baseline
      break;
    case 'bottom':
      startY = boundsHeight - totalTextHeight + lineHeight; // Last line at bottom
      break;
    case 'middle':
    default:
      startY = (boundsHeight - totalTextHeight) / 2 + lineHeight; // Centered
      break;
  }

  // Calculate position for each line
  for (let i = 0; i < lineCount; i++) {
    positions.push(startY + i * lineHeight);
  }

  return positions;
}

/**
 * Calculate X-position for a line based on alignment
 *
 * @param line - The text line
 * @param boundsWidth - Available width
 * @param fontFamily - Font family name
 * @param fontSize - Font size in pixels
 * @param fontWeight - Font weight
 * @param alignment - Text alignment
 * @returns X-coordinate for text-anchor positioning
 */
export function calculateLineXPosition(
  line: string,
  boundsWidth: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  alignment: TextAlignment
): number {
  const lineWidth = measureText(line, fontFamily, fontSize, fontWeight);

  switch (alignment) {
    case 'left':
      return 0;
    case 'right':
      return boundsWidth - lineWidth;
    case 'center':
    default:
      return (boundsWidth - lineWidth) / 2;
  }
}

/**
 * Get SVG text-anchor value for alignment
 *
 * SVG text-anchor determines how text is positioned relative to its x coordinate
 *
 * @param alignment - Text alignment
 * @returns SVG text-anchor value ('start' | 'middle' | 'end')
 */
export function getSVGTextAnchor(alignment: TextAlignment): 'start' | 'middle' | 'end' {
  switch (alignment) {
    case 'left':
      return 'start';
    case 'right':
      return 'end';
    case 'center':
    default:
      return 'middle';
  }
}

/**
 * Layout text in a constrained area with automatic sizing
 *
 * Convenience function that combines measurement and layout for common use cases.
 * Automatically finds the best font size and lays out the text.
 *
 * @param text - Text to layout
 * @param bounds - Width and height constraints
 * @param fontFamily - Font family name
 * @param fontWeight - Font weight
 * @param options - Layout options
 * @returns Text block with layout data
 *
 * @example
 * // Let the engine choose the best size
 * const block = autoLayoutText(
 *   "Long sign text",
 *   { width: 600, height: 100 },
 *   "Montserrat",
 *   700
 * );
 */
export function autoLayoutText(
  text: string,
  bounds: { width: number; height: number },
  fontFamily: string,
  fontWeight: number,
  options: LayoutTextBlockOptions = {}
): TextBlock {
  // Start with a sensible default size based on bounds
  const defaultSize = Math.min(bounds.height * 0.6, 96);

  return layoutTextBlock(text, bounds, fontFamily, defaultSize, fontWeight, {
    ...options,
    allowShrink: true,
  });
}

/**
 * Check if text will fit at a given size without wrapping
 *
 * Useful for determining if text can be displayed as a single line
 *
 * @param text - Text to check
 * @param width - Available width
 * @param fontFamily - Font family name
 * @param fontSize - Font size to test
 * @param fontWeight - Font weight
 * @returns True if text fits on one line
 */
export function willFitOnOneLine(
  text: string,
  width: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number
): boolean {
  const textWidth = measureText(text, fontFamily, fontSize, fontWeight);
  return textWidth <= width;
}

/**
 * Split text into lines manually at newline characters, then wrap each segment
 *
 * Handles cases where text contains explicit line breaks (\n)
 *
 * @param text - Text potentially containing \n characters
 * @param maxWidth - Maximum width per line
 * @param fontFamily - Font family name
 * @param fontSize - Font size in pixels
 * @param fontWeight - Font weight
 * @returns Array of wrapped lines
 *
 * @example
 * const lines = wrapTextWithNewlines(
 *   "Line 1\nLine 2\nLong line 3 that needs wrapping",
 *   400, "Arial", 16, 400
 * );
 * // Handles both manual and automatic line breaks
 */
export function wrapTextWithNewlines(
  text: string,
  maxWidth: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number
): string[] {
  const segments = text.split('\n');
  const allLines: string[] = [];

  for (const segment of segments) {
    const wrappedLines = wrapTextToLines(segment, maxWidth, fontFamily, fontSize, fontWeight);
    allLines.push(...wrappedLines);
  }

  return allLines;
}

/**
 * Calculate ideal font size for a single line of text
 *
 * Simpler than multi-line layout - just finds largest size that fits width
 *
 * @param text - Single line of text
 * @param maxWidth - Maximum width
 * @param fontFamily - Font family name
 * @param fontWeight - Font weight
 * @param minSize - Minimum font size (default: 14px)
 * @param maxSize - Maximum font size (default: 200px)
 * @returns Optimal font size in pixels
 */
export function calculateSingleLineFitSize(
  text: string,
  maxWidth: number,
  fontFamily: string,
  fontWeight: number,
  minSize: number = 14,
  maxSize: number = 200
): number {
  if (!text) return minSize;

  let low = minSize;
  let high = maxSize;
  let optimalSize = minSize;

  // Binary search
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const width = measureText(text, fontFamily, mid, fontWeight);

    if (width <= maxWidth) {
      optimalSize = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return optimalSize;
}
