'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * Light/dark toggle. Self-contained: it reads the current theme straight off
 * the <html> class (set pre-paint by the inline script in the root layout, so
 * there's no flash), flips it, and persists the choice to localStorage.
 */
export function ThemeToggle() {
    const [dark, setDark] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setDark(document.documentElement.classList.contains('dark'));
        setMounted(true);
    }, []);

    function toggle() {
        const next = !document.documentElement.classList.contains('dark');
        document.documentElement.classList.toggle('dark', next);
        try {
            localStorage.setItem('theme', next ? 'dark' : 'light');
        } catch {
            /* private mode — ignore */
        }
        setDark(next);
    }

    return (
        <button
            onClick={toggle}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-[var(--bg-fg-muted)] dark:hover:bg-white/10 dark:hover:text-white"
        >
            {/* Render a stable icon until mounted to avoid hydration mismatch. */}
            {mounted && dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
    );
}
