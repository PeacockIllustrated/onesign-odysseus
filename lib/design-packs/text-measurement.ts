/**
 * Text Measurement Utilities
 *
 * Provides font-aware text measurement using the Canvas API.
 * This is the industry-standard approach used by professional design tools
 * (Figma, Canva, Adobe) for pixel-perfect text layout.
 *
 * All measurements are client-side using browser-native Canvas API.
 */

/**
 * Measure text width using canvas for pixel-perfect accuracy
 *
 * @param text - The text to measure
 * @param fontFamily - Font family name (e.g., "Montserrat")
 * @param fontSize - Font size in pixels
 * @param fontWeight - Font weight (100-900)
 * @returns Width of the text in pixels
 *
 * @example
 * const width = measureText("Hello World", "Arial", 24, 700);
 * console.log(`Text is ${width}px wide`);
 */
export function measureText(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: number
): number {
  if (!text) return 0;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.warn('Canvas context not available, falling back to estimation');
    return text.length * fontSize * 0.6; // Fallback estimation
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
  const metrics = ctx.measureText(text);

  return metrics.width;
}

/**
 * Calculate optimal font size to fit text within bounds using binary search
 *
 * This algorithm finds the largest font size where the text fits within
 * the specified width and height constraints.
 *
 * @param text - The text to fit
 * @param maxWidth - Maximum width in pixels
 * @param maxHeight - Maximum height in pixels (for single line)
 * @param fontFamily - Font family name
 * @param fontWeight - Font weight (100-900)
 * @param minSize - Minimum allowed font size (default: 14px)
 * @param maxSize - Maximum allowed font size (default: 200px)
 * @returns Optimal font size in pixels
 *
 * @example
 * const size = calculateFitSize(
 *   "Long text that needs to fit",
 *   700, // max width
 *   100, // max height
 *   "Montserrat",
 *   700
 * );
 */
export function calculateFitSize(
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  fontWeight: number,
  minSize: number = 14,
  maxSize: number = 200
): number {
  if (!text) return minSize;

  let low = minSize;
  let high = Math.min(maxSize, maxHeight); // Font size can't exceed height
  let optimalSize = minSize;

  // Binary search for optimal size
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const width = measureText(text, fontFamily, mid, fontWeight);

    if (width <= maxWidth) {
      // Text fits, try larger
      optimalSize = mid;
      low = mid + 1;
    } else {
      // Text doesn't fit, try smaller
      high = mid - 1;
    }
  }

  return optimalSize;
}

/**
 * Break text into lines with intelligent word wrapping
 *
 * Respects word boundaries and wraps at spaces. Does not split words
 * unless absolutely necessary (word longer than maxWidth).
 *
 * @param text - The text to wrap
 * @param maxWidth - Maximum width per line in pixels
 * @param fontFamily - Font family name
 * @param fontSize - Font size in pixels
 * @param fontWeight - Font weight (100-900)
 * @returns Array of lines that fit within maxWidth
 *
 * @example
 * const lines = wrapTextToLines(
 *   "This is a long piece of text that needs wrapping",
 *   400,
 *   "Arial",
 *   16,
 *   400
 * );
 * // lines = ["This is a long piece", "of text that needs", "wrapping"]
 */
export function wrapTextToLines(
  text: string,
  maxWidth: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number
): string[] {
  if (!text) return [];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = measureText(testLine, fontFamily, fontSize, fontWeight);

    if (testWidth <= maxWidth) {
      // Word fits on current line
      currentLine = testLine;
    } else {
      // Word doesn't fit
      if (currentLine) {
        // Push current line and start new line with this word
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word exceeds maxWidth - force it anyway
        lines.push(word);
        currentLine = '';
      }
    }
  }

  // Don't forget the last line
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Calculate text metrics for multi-line text
 *
 * Provides comprehensive measurements for text layout including
 * total height, line count, and overflow detection.
 *
 * @param text - The text to analyze
 * @param maxWidth - Maximum width in pixels
 * @param maxHeight - Maximum height in pixels
 * @param fontFamily - Font family name
 * @param fontSize - Font size in pixels
 * @param fontWeight - Font weight (100-900)
 * @param lineHeightMultiplier - Line height as multiple of font size (default: 1.3)
 * @returns Text metrics object
 *
 * @example
 * const metrics = calculateTextMetrics(
 *   "Multi-line text",
 *   400, 200,
 *   "Arial", 16, 400
 * );
 * console.log(`Lines: ${metrics.lineCount}, Overflows: ${metrics.overflows}`);
 */
export function calculateTextMetrics(
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  lineHeightMultiplier: number = 1.3
): {
  lines: string[];
  lineCount: number;
  lineHeight: number;
  totalHeight: number;
  overflows: boolean;
  maxLineWidth: number;
} {
  const lines = wrapTextToLines(text, maxWidth, fontFamily, fontSize, fontWeight);
  const lineHeight = fontSize * lineHeightMultiplier;
  const totalHeight = lines.length * lineHeight;
  const overflows = totalHeight > maxHeight;

  // Find maximum line width
  let maxLineWidth = 0;
  for (const line of lines) {
    const width = measureText(line, fontFamily, fontSize, fontWeight);
    maxLineWidth = Math.max(maxLineWidth, width);
  }

  return {
    lines,
    lineCount: lines.length,
    lineHeight,
    totalHeight,
    overflows,
    maxLineWidth,
  };
}

/**
 * Calculate optimal font size for multi-line text
 *
 * Unlike calculateFitSize (which handles single lines), this function
 * finds the best font size for text that wraps across multiple lines,
 * ensuring both width and total height constraints are respected.
 *
 * @param text - The text to fit
 * @param maxWidth - Maximum width in pixels
 * @param maxHeight - Maximum height in pixels
 * @param fontFamily - Font family name
 * @param fontWeight - Font weight (100-900)
 * @param minSize - Minimum allowed font size (default: 14px)
 * @param maxSize - Maximum allowed font size (default: 200px)
 * @param lineHeightMultiplier - Line height as multiple of font size (default: 1.3)
 * @returns Optimal font size in pixels
 *
 * @example
 * const size = calculateMultiLineFitSize(
 *   "Longer text that will wrap across multiple lines",
 *   600, 200,
 *   "Montserrat", 700
 * );
 */
export function calculateMultiLineFitSize(
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  fontWeight: number,
  minSize: number = 14,
  maxSize: number = 200,
  lineHeightMultiplier: number = 1.3
): number {
  if (!text) return minSize;

  let low = minSize;
  let high = maxSize;
  let optimalSize = minSize;

  // Binary search for optimal size
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const metrics = calculateTextMetrics(
      text,
      maxWidth,
      maxHeight,
      fontFamily,
      mid,
      fontWeight,
      lineHeightMultiplier
    );

    if (!metrics.overflows) {
      // Text fits, try larger
      optimalSize = mid;
      low = mid + 1;
    } else {
      // Text doesn't fit, try smaller
      high = mid - 1;
    }
  }

  return optimalSize;
}

/**
 * Estimate character width for a given font (fallback when canvas unavailable)
 *
 * Provides rough estimates based on font characteristics.
 * Only used as a fallback when Canvas API is not available.
 *
 * @param fontFamily - Font family name
 * @param fontSize - Font size in pixels
 * @returns Estimated average character width in pixels
 */
export function estimateCharWidth(fontFamily: string, fontSize: number): number {
  // Condensed fonts
  if (fontFamily.includes('Condensed') || fontFamily.includes('Narrow')) {
    return fontSize * 0.45;
  }

  // Monospace fonts
  if (fontFamily.includes('Mono') || fontFamily.includes('Code')) {
    return fontSize * 0.6;
  }

  // Wide fonts
  if (fontFamily.includes('Bold') || fontFamily.includes('Black')) {
    return fontSize * 0.65;
  }

  // Default proportional fonts
  return fontSize * 0.55;
}
