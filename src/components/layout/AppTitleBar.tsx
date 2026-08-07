import { MoonIcon, SunIcon } from 'lucide-react';

import { Button } from '@/ui/button';

export function AppTitleBar({
    theme,
    onToggleTheme
}: {
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}) {
    const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;

    return (
        <header
            data-app-titlebar="true"
            className="vrcx-0-titlebar text-foreground relative z-60 flex h-8 shrink-0 items-center border-b px-2 select-none"
        >
            <span className="font-heading text-[0.8rem] font-medium">
                VRCX-Extras
            </span>
            <span className="text-muted-foreground ml-2 text-xs">
                Companion
            </span>

            <div className="ml-auto flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                        theme === 'dark'
                            ? 'Switch to light theme'
                            : 'Switch to dark theme'
                    }
                    onClick={onToggleTheme}
                >
                    <ThemeIcon />
                </Button>
            </div>
        </header>
    );
}
