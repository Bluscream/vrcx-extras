import {
    AlertCircleIcon,
    FilterIcon,
    SearchIcon,
    UsersIcon
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLinkFinder } from '@/hooks/useLinkFinder';
import { buildLaunchUri } from '@/lib/format';
import type { OverlappingSession, Player } from '@/types';
import { Button } from '@/ui/button';
import { Card, CardContent } from '@/ui/card';
import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle
} from '@/ui/empty';
import { Input } from '@/ui/input';
import { Spinner } from '@/ui/spinner';

import { PlayerPicker } from './PlayerPicker';
import { SessionCard } from './SessionCard';
import { SessionStats } from './SessionStats';

function matchesFilter(session: OverlappingSession, needle: string) {
    return (
        session.worldName.toLowerCase().includes(needle) ||
        session.worldId.toLowerCase().includes(needle) ||
        session.location.toLowerCase().includes(needle) ||
        session.participants.some((participant) =>
            participant.displayName.toLowerCase().includes(needle)
        )
    );
}

export function LinkFinderPage({
    onResultCountChange
}: {
    onResultCountChange: (count: number | null) => void;
}) {
    const [selected, setSelected] = useState<Player[]>([]);
    const [filter, setFilter] = useState('');
    const debouncedFilter = useDebouncedValue(filter.trim().toLowerCase(), 150);

    const { results, isLoading, error, run } = useLinkFinder();
    const { copiedKey, copy } = useCopyToClipboard();

    const filteredResults = useMemo(() => {
        if (!results) {
            return null;
        }
        if (!debouncedFilter) {
            return results;
        }
        return results.filter((session) =>
            matchesFilter(session, debouncedFilter)
        );
    }, [results, debouncedFilter]);

    useEffect(() => {
        onResultCountChange(filteredResults?.length ?? null);
    }, [filteredResults, onResultCountChange]);

    function addPlayer(player: Player) {
        setSelected((current) =>
            current.some((entry) => entry.id === player.id)
                ? current
                : [...current, player]
        );
    }

    function removePlayer(id: string) {
        setSelected((current) => current.filter((entry) => entry.id !== id));
    }

    const canSearch = selected.length > 0 && !isLoading;

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
            {/*
              * Card clips its children so image corners stay rounded, which
              * would also clip the player picker's popup. This card holds no
              * images, so it opts out and takes a stacking context above the
              * results list instead.
              */}
            <Card className="relative z-20 overflow-visible">
                <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <PlayerPicker
                        selected={selected}
                        onAdd={addPlayer}
                        onRemove={removePlayer}
                    />

                    <Button
                        className="shrink-0"
                        disabled={!canSearch}
                        onClick={() =>
                            run(selected.map((player) => player.id))
                        }
                    >
                        {isLoading ? <Spinner /> : <SearchIcon />}
                        Find links
                    </Button>
                </CardContent>
            </Card>

            {error ? (
                <div className="text-destructive bg-destructive/10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                    <AlertCircleIcon className="size-4 shrink-0" />
                    {error}
                </div>
            ) : null}

            {filteredResults && filteredResults.length > 0 ? (
                <SessionStats sessions={filteredResults} />
            ) : null}

            {results && results.length > 0 ? (
                <div className="relative w-full sm:max-w-64 sm:self-end">
                    <FilterIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                        placeholder="Filter instances…"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        className="pl-7.5"
                    />
                </div>
            ) : null}

            {isLoading ? (
                <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
                    <Spinner className="size-6" />
                    Analyzing overlapping activity…
                </div>
            ) : !filteredResults ? (
                <Empty>
                    <EmptyMedia>
                        <UsersIcon />
                    </EmptyMedia>
                    <div className="space-y-1">
                        <EmptyTitle>Find shared instances</EmptyTitle>
                        <EmptyDescription>
                            Select two or more players to query overlapping
                            instance history straight from your read-only VRCX
                            database.
                        </EmptyDescription>
                    </div>
                </Empty>
            ) : filteredResults.length === 0 ? (
                <Empty>
                    <EmptyMedia>
                        <SearchIcon />
                    </EmptyMedia>
                    <div className="space-y-1">
                        <EmptyTitle>No overlapping sessions</EmptyTitle>
                        <EmptyDescription>
                            {results && results.length > 0
                                ? 'No session matches the current filter.'
                                : 'These players were never in the same instance during the selected range.'}
                        </EmptyDescription>
                    </div>
                </Empty>
            ) : (
                <div className="flex flex-col gap-2">
                    {filteredResults.map((session) => {
                        const key = `${session.location}-${session.joinedAt}`;
                        return (
                            <SessionCard
                                key={key}
                                session={session}
                                isCopied={copiedKey === key}
                                onCopy={() =>
                                    copy(key, buildLaunchUri(session.location))
                                }
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
