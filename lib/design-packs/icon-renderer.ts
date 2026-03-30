/**
 * Icon Renderer
 *
 * Utilities for rendering Lucide icons as SVG elements
 * for embedding in sign templates
 */

import { getIconById, type GraphicIcon } from './graphic-library';
import type { GraphicElement } from './types';

/**
 * Render a graphic element as an SVG group
 *
 * This takes a GraphicElement and returns an SVG <g> element
 * with the icon positioned, sized, rotated, and colored
 *
 * @param element - The graphic element to render
 * @param scaleX - Scale factor from mm to SVG pixels (canvasWidth / signWidth_mm)
 * @param scaleY - Scale factor from mm to SVG pixels (canvasHeight / signHeight_mm)
 * @returns SVG string for the icon
 */
export function renderGraphicElement(
    element: GraphicElement,
    scaleX: number = 1,
    scaleY: number = 1
): string {
    const icon = getIconById(element.icon_id);
    if (!icon) return '';

    // Get the icon's SVG path data
    // For Lucide icons, we need to render them as inline SVG
    const iconSvg = getIconSvgPath(icon);
    if (!iconSvg) return '';

    // Scale coordinates from mm to pixels
    const scaledX = element.x * scaleX;
    const scaledY = element.y * scaleY;

    // Calculate transform
    const transform = `translate(${scaledX}, ${scaledY}) rotate(${element.rotation}) scale(${element.size / 24})`;

    return `
    <g transform="${transform}" opacity="${element.opacity}">
        ${iconSvg.replace(/stroke="[^"]*"/, `stroke="${element.color}"`)}
    </g>`;
}

/**
 * Render multiple graphic elements
 *
 * @param elements - Array of graphic elements
 * @param canvasWidth - SVG canvas width in pixels
 * @param canvasHeight - SVG canvas height in pixels
 * @param signWidth - Sign width in millimeters
 * @param signHeight - Sign height in millimeters
 * @returns Combined SVG string
 */
export function renderGraphicElements(
    elements: GraphicElement[],
    canvasWidth: number,
    canvasHeight: number,
    signWidth: number,
    signHeight: number
): string {
    if (!elements || elements.length === 0) return '';

    // Calculate scale factors to convert mm to pixels
    const scaleX = canvasWidth / signWidth;
    const scaleY = canvasHeight / signHeight;

    return elements.map(element => renderGraphicElement(element, scaleX, scaleY)).join('\n');
}

/**
 * Get the SVG path data for an icon
 *
 * This is a simplified version that generates basic shapes for common icons
 * In production, you would want to extract actual Lucide icon paths
 *
 * @param icon - The icon to get SVG for
 * @returns SVG content
 */
function getIconSvgPath(icon: GraphicIcon): string {
    // Map of common icons to their SVG paths
    // These are simplified representations - in production you'd use actual Lucide paths
    const iconPaths: Record<string, string> = {
        // Arrows
        'arrow-right': '<line x1="-10" y1="0" x2="10" y2="0" stroke-width="2" stroke-linecap="round"/><polyline points="5,-5 10,0 5,5" fill="none" stroke-width="2" stroke-linejoin="round"/>',
        'arrow-left': '<line x1="10" y1="0" x2="-10" y2="0" stroke-width="2" stroke-linecap="round"/><polyline points="-5,-5 -10,0 -5,5" fill="none" stroke-width="2" stroke-linejoin="round"/>',
        'arrow-up': '<line x1="0" y1="10" x2="0" y2="-10" stroke-width="2" stroke-linecap="round"/><polyline points="-5,-5 0,-10 5,-5" fill="none" stroke-width="2" stroke-linejoin="round"/>',
        'arrow-down': '<line x1="0" y1="-10" x2="0" y2="10" stroke-width="2" stroke-linecap="round"/><polyline points="-5,5 0,10 5,5" fill="none" stroke-width="2" stroke-linejoin="round"/>',

        // Facilities
        'coffee': '<path d="M-8,-6 L-8,6 Q-8,8 -6,8 L6,8 Q8,8 8,6 L8,-6 Z M8,0 L12,0 Q14,0 14,2 Q14,4 12,4 L8,4" fill="none" stroke-width="2" stroke-linecap="round"/><line x1="-4" y1="-10" x2="-4" y2="-6" stroke-width="1.5" stroke-linecap="round"/><line x1="0" y1="-10" x2="0" y2="-6" stroke-width="1.5" stroke-linecap="round"/><line x1="4" y1="-10" x2="4" y2="-6" stroke-width="1.5" stroke-linecap="round"/>',
        'utensils': '<line x1="-6" y1="-10" x2="-6" y2="10" stroke-width="2" stroke-linecap="round"/><line x1="-9" y1="-10" x2="-9" y2="-2" stroke-width="1.5" stroke-linecap="round"/><line x1="-3" y1="-10" x2="-3" y2="-2" stroke-width="1.5" stroke-linecap="round"/><path d="M2,-10 Q4,-10 4,-8 L4,2 Q4,10 8,10" fill="none" stroke-width="2" stroke-linecap="round"/>',
        'info': '<circle cx="0" cy="0" r="10" fill="none" stroke-width="2"/><line x1="0" y1="-3" x2="0" y2="6" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="-6" r="1" fill="currentColor"/>',
        'wifi': '<path d="M-12,-3 Q-12,-12 0,-12 Q12,-12 12,-3" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M-8,0 Q-8,-6 0,-6 Q8,-6 8,0" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M-4,3 Q-4,0 0,0 Q4,0 4,3" fill="none" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="7" r="1.5"/>',

        // Accessibility
        'accessibility': '<circle cx="0" cy="-6" r="2.5" fill="none" stroke-width="2"/><path d="M0,-3 L0,5 M-6,1 L6,1 M0,5 L-5,10 M0,5 L5,10" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
        'heart-pulse': '<path d="M0,10 Q-10,0 -10,-5 Q-10,-10 -5,-10 Q0,-10 0,-5 Q0,-10 5,-10 Q10,-10 10,-5 Q10,0 0,10" fill="none" stroke-width="2"/><polyline points="-8,0 -6,0 -4,-4 -2,4 0,0 2,0" fill="none" stroke-width="1.5" stroke-linejoin="round"/>',
        'alert-triangle': '<path d="M0,-10 L10,8 L-10,8 Z" fill="none" stroke-width="2" stroke-linejoin="round"/><line x1="0" y1="-4" x2="0" y2="2" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="5" r="1"/>',

        // Transport
        'car': '<rect x="-10" y="-3" width="20" height="8" rx="2" fill="none" stroke-width="2"/><path d="M-8,-3 L-6,-7 L6,-7 L8,-3" fill="none" stroke-width="2" stroke-linejoin="round"/><circle cx="-6" cy="5" r="2" fill="none" stroke-width="2"/><circle cx="6" cy="5" r="2" fill="none" stroke-width="2"/><line x1="-10" y1="5" x2="-8" y2="5" stroke-width="2"/><line x1="8" y1="5" x2="10" y2="5" stroke-width="2"/>',
        'parking-circle': '<circle cx="0" cy="0" r="10" fill="none" stroke-width="2"/><path d="M-3,-7 L-3,7 M-3,-7 L3,-7 Q6,-7 6,-3 Q6,1 3,1 L-3,1" fill="none" stroke-width="2" stroke-linejoin="round"/>',
        'bike': '<circle cx="-6" cy="5" r="4" fill="none" stroke-width="2"/><circle cx="8" cy="5" r="4" fill="none" stroke-width="2"/><path d="M0,-5 L2,5 M-3,0 L0,-5 L5,0 L8,5" fill="none" stroke-width="2" stroke-linejoin="round"/>',

        // Nature
        'tree-pine': '<path d="M0,-12 L-6,-3 L-4,-3 L-8,3 L-5,3 L-8,10 L8,10 L5,3 L8,3 L4,-3 L6,-3 Z" fill="none" stroke-width="1.5" stroke-linejoin="round"/><line x1="0" y1="10" x2="0" y2="14" stroke-width="2"/>',
        'flower': '<circle cx="0" cy="0" r="2" fill="currentColor"/><ellipse cx="0" cy="-5" rx="2.5" ry="4" fill="none" stroke-width="1.5"/><ellipse cx="5" cy="0" rx="4" ry="2.5" fill="none" stroke-width="1.5"/><ellipse cx="0" cy="5" rx="2.5" ry="4" fill="none" stroke-width="1.5"/><ellipse cx="-5" cy="0" rx="4" ry="2.5" fill="none" stroke-width="1.5"/>',
        'sun': '<circle cx="0" cy="0" r="5" fill="none" stroke-width="2"/><line x1="0" y1="-12" x2="0" y2="-8" stroke-width="2" stroke-linecap="round"/><line x1="0" y1="8" x2="0" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="0" x2="8" y2="0" stroke-width="2" stroke-linecap="round"/><line x1="-8" y1="0" x2="-12" y2="0" stroke-width="2" stroke-linecap="round"/><line x1="8.5" y1="-8.5" x2="6" y2="-6" stroke-width="2" stroke-linecap="round"/><line x1="-6" y1="6" x2="-8.5" y2="8.5" stroke-width="2" stroke-linecap="round"/><line x1="8.5" y1="8.5" x2="6" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="-6" y1="-6" x2="-8.5" y2="-8.5" stroke-width="2" stroke-linecap="round"/>',

        // Shapes
        'circle': '<circle cx="0" cy="0" r="8" fill="none" stroke-width="2"/>',
        'square': '<rect x="-8" y="-8" width="16" height="16" fill="none" stroke-width="2"/>',
        'star': '<path d="M0,-10 L2,-3 L10,-3 L4,2 L6,10 L0,5 L-6,10 L-4,2 L-10,-3 L-2,-3 Z" fill="none" stroke-width="1.5" stroke-linejoin="round"/>',
        'heart': '<path d="M0,8 Q-10,0 -10,-4 Q-10,-8 -6,-8 Q-2,-8 0,-4 Q2,-8 6,-8 Q10,-8 10,-4 Q10,0 0,8" fill="none" stroke-width="2"/>',
        'check': '<polyline points="-8,0 -2,6 8,-6" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    };

    return iconPaths[icon.id] || `<circle cx="0" cy="0" r="8" fill="none" stroke-width="2"/>`;
}

/**
 * Create a standalone SVG icon for preview purposes
 *
 * @param iconId - Icon ID from library
 * @param size - Size in pixels
 * @param color - Stroke color
 * @returns Complete SVG element string
 */
export function createIconSvg(iconId: string, size: number = 24, color: string = '#000000'): string {
    const icon = getIconById(iconId);
    if (!icon) return '';

    const iconPath = getIconSvgPath(icon);
    if (!iconPath) return '';

    return `
<svg width="${size}" height="${size}" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg">
    <g stroke="${color}" fill="none">
        ${iconPath}
    </g>
</svg>`.trim();
}
