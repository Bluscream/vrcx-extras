import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { usePlayerSearch } from '@/hooks/usePlayerSearch';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Player } from '@/types';
import { Badge } from '@/ui/badge';
import { Input } from '@/ui/input';
import { Spinner } from '@/ui/spinner';

import { PlayerMarkers } from './PlayerMarkers';

export function PlayerPicker({
    selected,
    onAdd,
    onRemove,
    isBusy = false
}: {
    selected: Player[];
    onAdd: (player: Player) => void;
    onRemove: (id: string) => void;
    /** Shows the spinner while a deep link is being resolved. */
    isBusy?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();

    const { candidates, isSearching, error } = usePlayerSearch(query);

    const selectedIds = useMemo(
        () => new Set(selected.map((player) => player.id)),
        [selected]
    );
    const options = useMemo(
        () => candidates.filter((player) => !selectedIds.has(player.id)),
        [candidates, selectedIds]
    );

    useEffect(() => {
        setActiveIndex(0);
    }, [options]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () =>
            document.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    function select(player: Player) {
        onAdd(player);
        setQuery('');
        setIsOpen(false);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Escape') {
            setIsOpen(false);
            return;
        }
        if (
            event.key === 'Backspace' &&
            query === '' &&
            selected.length > 0
        ) {
            const last = selected[selected.length - 1];
            if (last) {
                onRemove(last.id);
            }
            return;
        }
        if (options.length === 0) {
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) => (index + 1) % options.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex(
                (index) => (index - 1 + options.length) % options.length
            );
        } else if (event.key === 'Enter' && isOpen) {
            event.preventDefault();
            const option = options[activeIndex];
            if (option) {
                select(option);
            }
        }
    }

    const showList = isOpen && (options.length > 0 || Boolean(error));

    return (
        <div ref={containerRef} className="relative min-w-0 flex-1">
            <div className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex min-h-8 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1 transition-colors focus-within:ring-3">
                <SearchIcon className="text-muted-foreground ml-1 size-3.5 shrink-0" />

                {selected.map((player) => (
                    <Badge
                        key={player.id}
                        variant="secondary"
                        className="gap-0.5 pr-0.5"
                    >
                        <PlayerMarkers player={player} />
                        <span className="max-w-40 truncate">
                            {player.displayName}
                        </span>
                        <button
                            type="button"
                            aria-label={`Remove ${player.displayName}`}
                            onClick={() => onRemove(player.id)}
                            className="hover:text-destructive focus-visible:ring-ring/50 rounded-full p-0.5 outline-none transition-colors focus-visible:ring-2"
                        >
                            <XIcon className="size-3" />
                        </button>
                    </Badge>
                ))}

                <Input
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    placeholder={
                        selected.length === 0 ? 'Search players…' : undefined
                    }
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    className="h-6 min-w-32 flex-1 border-0 bg-transparent px-1 text-sm focus-visible:ring-0 dark:bg-transparent"
                />

                {isSearching || isBusy ? (
                    <Spinner className="text-muted-foreground mr-1 size-3.5" />
                ) : null}
            </div>

            {showList ? (
                <div
                    id={listboxId}
                    role="listbox"
                    className="bg-popover text-popover-foreground ring-foreground/10 animate-in fade-in-0 zoom-in-95 absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg p-1 shadow-md ring-1"
                >
                    {error ? (
                        <p className="text-destructive px-2 py-1.5 text-xs">
                            {error}
                        </p>
                    ) : (
                        options.map((player, index) => {
                            const lastSeen = formatRelative(player.lastSeen);
                            return (
                                <button
                                    key={player.id}
                                    type="button"
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    onPointerEnter={() => setActiveIndex(index)}
                                    onClick={() => select(player)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none',
                                        index === activeIndex && 'bg-accent'
                                    )}
                                >
                                    <PlayerMarkers player={player} />
                                    <span className="min-w-0 flex-1 truncate font-medium">
                                        {player.displayName}
                                    </span>
                                    <span className="text-muted-foreground shrink-0 text-[0.7rem]">
                                        {lastSeen ?? 'never seen'}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            ) : null}
        </div>
    );
}
