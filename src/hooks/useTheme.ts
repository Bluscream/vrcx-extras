import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const storageKey = 'vrcx-extras-theme';

function readStoredTheme(): Theme {
    try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
    } catch {
        // Storage can be unavailable in restricted contexts; fall through.
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
}

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(readStoredTheme);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.documentElement.style.colorScheme = theme;
        try {
            window.localStorage.setItem(storageKey, theme);
        } catch {
            // no-op
        }
    }, [theme]);

    const toggleTheme = useCallback(
        () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
        []
    );

    return { theme, toggleTheme };
}
