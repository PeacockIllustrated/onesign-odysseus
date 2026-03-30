/**
 * Dynamic Google Font loader for design pack creator
 * Client-side only (browser API usage)
 */

// =============================================================================
// FONT LOADING STATE
// =============================================================================

// Track loaded fonts to avoid duplicate loads
const loadedFonts = new Set<string>();

// Track pending font loads to avoid duplicate requests
const pendingLoads = new Map<string, Promise<void>>();

// =============================================================================
// FONT LOADING FUNCTIONS
// =============================================================================

/**
 * Load a Google Font dynamically
 * @param fontUrl - Google Fonts CSS URL
 * @returns Promise that resolves when font is loaded
 */
export function loadGoogleFont(fontUrl: string): Promise<void> {
    // Check if already loaded
    if (loadedFonts.has(fontUrl)) {
        return Promise.resolve();
    }

    // Check if load is in progress
    if (pendingLoads.has(fontUrl)) {
        return pendingLoads.get(fontUrl)!;
    }

    // Create new load promise
    const loadPromise = new Promise<void>((resolve, reject) => {
        // Create link element
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = fontUrl;

        // Handle load success
        link.onload = () => {
            loadedFonts.add(fontUrl);
            pendingLoads.delete(fontUrl);
            resolve();
        };

        // Handle load error
        link.onerror = () => {
            pendingLoads.delete(fontUrl);
            console.error(`failed to load font: ${fontUrl}`);
            reject(new Error(`failed to load font: ${fontUrl}`));
        };

        // Add to document head
        document.head.appendChild(link);
    });

    pendingLoads.set(fontUrl, loadPromise);
    return loadPromise;
}

/**
 * Load multiple Google Fonts in parallel
 * @param fontUrls - Array of Google Fonts CSS URLs
 * @returns Promise that resolves when all fonts are loaded
 */
export async function loadGoogleFonts(fontUrls: string[]): Promise<void> {
    const uniqueUrls = Array.from(new Set(fontUrls.filter(Boolean)));
    await Promise.all(uniqueUrls.map((url) => loadGoogleFont(url)));
}

/**
 * Wait for fonts to be ready in the document
 * Uses the native Font Loading API
 */
export async function waitForFontsReady(): Promise<void> {
    if ('fonts' in document) {
        await document.fonts.ready;
    } else {
        // Fallback for browsers without Font Loading API
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

/**
 * Load a font and wait for it to be ready
 * @param fontUrl - Google Fonts CSS URL
 * @param fontFamily - Font family name (e.g., "Montserrat")
 */
export async function loadAndWaitForFont(fontUrl: string, fontFamily: string): Promise<void> {
    await loadGoogleFont(fontUrl);

    // Wait for specific font to be available
    if ('fonts' in document) {
        try {
            await document.fonts.load(`16px "${fontFamily}"`);
        } catch (err) {
            console.warn(`font load check failed for ${fontFamily}:`, err);
        }
    }
}

// =============================================================================
// PRELOAD UTILITIES
// =============================================================================

/**
 * Preload a Google Font (add <link rel="preload"> to head)
 * Improves performance by starting download earlier
 */
export function preloadGoogleFont(fontUrl: string): void {
    if (loadedFonts.has(fontUrl)) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = fontUrl;
    document.head.appendChild(link);
}

/**
 * Preload multiple Google Fonts
 */
export function preloadGoogleFonts(fontUrls: string[]): void {
    const uniqueUrls = Array.from(new Set(fontUrls.filter(Boolean)));
    uniqueUrls.forEach((url) => preloadGoogleFont(url));
}

// =============================================================================
// FONT MANAGEMENT UTILITIES
// =============================================================================

/**
 * Check if a font URL is already loaded
 */
export function isFontLoaded(fontUrl: string): boolean {
    return loadedFonts.has(fontUrl);
}

/**
 * Clear loaded font tracking (for testing/debugging)
 */
export function clearLoadedFonts(): void {
    loadedFonts.clear();
    pendingLoads.clear();
}

/**
 * Get list of loaded font URLs
 */
export function getLoadedFonts(): string[] {
    return Array.from(loadedFonts);
}

// =============================================================================
// REACT HOOK (for convenience)
// =============================================================================

/**
 * React hook for loading a Google Font
 * Usage:
 * ```tsx
 * const { loaded, error } = useGoogleFont(fontUrl);
 * ```
 */
export function useGoogleFont(fontUrl: string | null): {
    loaded: boolean;
    error: Error | null;
} {
    const [loaded, setLoaded] = React.useState(false);
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        if (!fontUrl) return;

        // Check if already loaded
        if (isFontLoaded(fontUrl)) {
            setLoaded(true);
            return;
        }

        // Load font
        loadGoogleFont(fontUrl)
            .then(() => {
                setLoaded(true);
                setError(null);
            })
            .catch((err) => {
                setLoaded(false);
                setError(err);
            });
    }, [fontUrl]);

    return { loaded, error };
}

// Note: Import React in components that use this hook
import React from 'react';
