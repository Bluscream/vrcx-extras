import { GlobeIcon, FileTextIcon, MoonIcon, SearchIcon, SunIcon, UserIcon, BoxIcon, CompassIcon, LayersIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { isAbortError, unifiedSearch } from '@/api/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SearchResultItem, UnifiedSearchResults } from '@/types';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Spinner } from '@/ui/spinner';

function getCategoryIcon(category: string) {
    switch (category) {
        case 'players':
            return UserIcon;
        case 'worlds':
            return GlobeIcon;
        case 'avatars':
            return BoxIcon;
        case 'instances':
            return LayersIcon;
        case 'pages':
            return FileTextIcon;
        default:
            return CompassIcon;
    }
}

export function AppTitleBar({
    theme,
    onToggleTheme
}: {
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}) {
    const ThemeIcon = theme === 'dark' ? SunIcon : MoonIcon;
    const navigate = useNavigate();

    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query.trim(), 200);
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<UnifiedSearchResults | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Global keyboard shortcut Ctrl+K or / to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
                e.preventDefault();
                inputRef.current?.focus();
                setIsOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!debouncedQuery) {
            setResults(null);
            setIsLoading(false);
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);

        unifiedSearch(debouncedQuery, controller.signal)
            .then((data) => {
                setResults(data);
            })
            .catch((cause) => {
                if (isAbortError(cause)) return;
                setResults(null);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [debouncedQuery]);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, []);

    function handleSelect(item: SearchResultItem) {
        setIsOpen(false);
        setQuery('');
        if (item.targetUrl.startsWith('vrcx-0://')) {
            window.location.href = item.targetUrl;
        } else {
            navigate(item.targetUrl);
        }
    }

    const hasResults =
        results &&
        (results.players.length > 0 ||
            results.worlds.length > 0 ||
            results.avatars.length > 0 ||
            results.instances.length > 0 ||
            results.pages.length > 0);

    const categories: Array<{ title: string; items: SearchResultItem[] }> = results
        ? [
              { title: 'Navigation Pages', items: results.pages },
              { title: 'Players', items: results.players.slice(0, 4) },
              { title: 'Worlds', items: results.worlds.slice(0, 4) },
              { title: 'Avatars', items: results.avatars.slice(0, 4) },
              { title: 'Instances', items: results.instances.slice(0, 3) }
          ].filter((cat) => cat.items.length > 0)
        : [];

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

            {/* Quick Global Search Bar placed on the right side next to theme toggle */}
            <div className="ml-auto flex items-center gap-2">
                <div ref={containerRef} className="relative w-64 max-w-xs">
                    <div className="border-input bg-background/50 focus-within:border-ring flex h-6 items-center rounded-md border px-1.5 transition-colors">
                        <SearchIcon className="text-muted-foreground mr-1 size-3 shrink-0" />
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Search everything... (Ctrl+K)"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setIsOpen(true);
                            }}
                            onFocus={() => setIsOpen(true)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && query.trim()) {
                                    setIsOpen(false);
                                    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                                } else if (e.key === 'Escape') {
                                    setIsOpen(false);
                                }
                            }}
                            className="h-full border-0 bg-transparent px-0 text-xs focus-visible:ring-0"
                        />
                        {isLoading && <Spinner className="size-3 shrink-0" />}
                    </div>

                    {isOpen && (query.trim() || hasResults) ? (
                        <div className="bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in-0 zoom-in-95 absolute top-full right-0 z-50 mt-1 max-h-80 w-80 overflow-y-auto rounded-lg p-1.5 shadow-md ring-1">
                            {hasResults ? (
                                <div className="flex flex-col gap-2">
                                    {categories.map((cat) => (
                                        <div key={cat.title}>
                                            <div className="text-muted-foreground px-2 py-1 text-[0.65rem] font-semibold tracking-wider uppercase">
                                                {cat.title}
                                            </div>
                                            {cat.items.map((item) => {
                                                const Icon = getCategoryIcon(item.category);
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => handleSelect(item)}
                                                        className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none"
                                                    >
                                                        <Icon className="text-muted-foreground size-3.5 shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-medium truncate">{item.title}</div>
                                                            {item.subtitle && (
                                                                <div className="text-muted-foreground truncate text-[0.65rem]">
                                                                    {item.subtitle}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-muted-foreground px-2 py-3 text-center text-xs">
                                    No matching results found. Press Enter for full search.
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

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
