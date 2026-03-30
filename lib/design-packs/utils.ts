/**
 * Utility functions for design pack creator
 */

import { ColourSpec } from './types';

// =============================================================================
// COLOUR UTILITIES
// =============================================================================

/**
 * Convert hex color to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : null;
}

/**
 * Calculate relative luminance for WCAG contrast calculations
 * https://www.w3.org/TR/WCAG20-TECHS/G17.html
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
        const srgb = c / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG contrast ratio between two colors
 * Returns ratio from 1 to 21
 */
export function calculateContrastRatio(hex1: string, hex2: string): number | null {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);

    if (!rgb1 || !rgb2) return null;

    const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG AA standards (4.5:1)
 */
export function meetsWCAGAA(contrastRatio: number): boolean {
    return contrastRatio >= 4.5;
}

/**
 * Check if contrast meets WCAG AAA standards (7:1)
 */
export function meetsWCAGAAA(contrastRatio: number): boolean {
    return contrastRatio >= 7.0;
}

/**
 * Get contrast rating label
 */
export function getContrastRating(contrastRatio: number): string {
    if (contrastRatio >= 7.0) return 'excellent (aaa)';
    if (contrastRatio >= 4.5) return 'good (aa)';
    if (contrastRatio >= 3.0) return 'fair';
    return 'poor';
}

/**
 * Enrich colour with contrast calculations against white background
 */
export function enrichColourWithContrast(hex: string, name: string): ColourSpec {
    const contrastRatio = calculateContrastRatio(hex, '#FFFFFF');

    return {
        hex,
        name,
        wcag_contrast_ratio: contrastRatio ? Math.round(contrastRatio * 10) / 10 : null,
    };
}

// =============================================================================
// PROGRESS UTILITIES
// =============================================================================

/**
 * Calculate design pack completion progress
 */
export function calculateProgress(
    typography?: { locked?: boolean },
    colours?: { locked?: boolean },
    graphicStyle?: { locked?: boolean },
    materials?: { locked?: boolean },
    signTypesCount?: number,
    environmentPreviews?: number
): {
    completed: number;
    total: number;
    percentage: number;
} {
    const sections = [
        typography?.locked || false,
        colours?.locked || false,
        graphicStyle?.locked || false,
        materials?.locked || false,
        (signTypesCount || 0) > 0,
        (environmentPreviews || 0) > 0,
    ];

    const completed = sections.filter(Boolean).length;
    const total = sections.length;
    const percentage = Math.round((completed / total) * 100);

    return { completed, total, percentage };
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate hex color format
 */
export function isValidHexColor(hex: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

/**
 * Generate a random hex color (for testing/placeholders)
 */
export function generateRandomHexColor(): string {
    return `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0')}`;
}

// =============================================================================
// FORMAT UTILITIES
// =============================================================================

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

/**
 * Get relative time (e.g., "2 hours ago")
 */
export function getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    return formatDate(dateString);
}

// =============================================================================
// IMAGE UTILITIES
// =============================================================================

/**
 * Validate image file type
 */
export function isValidImageType(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return validTypes.includes(file.type);
}

/**
 * Validate image file size (max 5MB)
 */
export function isValidImageSize(file: File, maxSizeMB: number = 5): boolean {
    const maxBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxBytes;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} b`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

// =============================================================================
// DEBOUNCE UTILITY
// =============================================================================

/**
 * Debounce function for auto-save
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    waitMs: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), waitMs);
    };
}

// =============================================================================
// WEATHER SIMULATION UTILITIES
// =============================================================================

/**
 * Get CSS filter string for weather modes
 */
export function getWeatherFilter(mode: 'day' | 'night' | 'weather'): string {
    switch (mode) {
        case 'night':
            return 'brightness(0.4) contrast(1.2)';
        case 'weather':
            return 'brightness(0.8) saturate(0.6) contrast(1.1)';
        case 'day':
        default:
            return 'none';
    }
}

/**
 * Get weather mode label
 */
export function getWeatherModeLabel(mode: 'day' | 'night' | 'weather'): string {
    switch (mode) {
        case 'night':
            return 'night view';
        case 'weather':
            return 'overcast / rainy';
        case 'day':
        default:
            return 'daytime';
    }
}

// =============================================================================
// COST TIER UTILITIES
// =============================================================================

/**
 * Get cost tier symbol
 */
export function getCostTierSymbol(tier: 1 | 2 | 3): string {
    return '£'.repeat(tier);
}

/**
 * Get cost tier label
 */
export function getCostTierLabel(tier: 1 | 2 | 3): string {
    switch (tier) {
        case 1:
            return 'budget-friendly';
        case 2:
            return 'mid-range';
        case 3:
            return 'premium';
    }
}
