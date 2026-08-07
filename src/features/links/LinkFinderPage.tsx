import {
    AlertCircleIcon,
    FilterIcon,
    SearchIcon,
    UsersIcon
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useReportResultCount } from '@/components/layout/AppShellLayout';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLinkFinder } from '@/hooks/useLinkFinder';
import { useSelectedPlayersParam } from '@/hooks/useSelectedPlayersParam';
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
import { SessionTable } from './SessionTable';
import { SessionStats } from './SessionStats';

function matchesFilter(session: OverlappingSession, needle: string) {
    return (
        session.worldName.toLowerCase().includes(needle) ||
        session.worldId.toLowerCase().includes(needle) ||
        session.location.toLowerCase().includes(needle) ||
        session.participants.some((participant) =>
            participant.displayName.toLowerCase().includes(needle)
        ) ||
        // Matching the roster makes the filter answer "which of these meetups
        // was <someone else> also in?".
        (session.roster?.names.some((name) =>
            name.toLowerCase().includes(needle)
        ) ??
            false)
    );
}

export function LinkFinderPage() {
    const onResultCountChange = useReportResultCount();
    const {
        selected,
        updateSelection,
        isHydrating,
        hydrationError,
        hadDeepLink
    } = useSelectedPlayersParam();
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
        if (!selected.some((entry) => entry.id === player.id)) {
            updateSelection([...selected, player]);
        }
    }

    function removePlayer(id: string) {
        updateSelection(selected.filter((entry) => entry.id !== id));
    }

    // A deep link should show results without a second click, but only once:
    // afterwards the button drives the search.
    const hasAutoRun = useRef(false);
    useEffect(() => {
        if (hasAutoRun.current || isHydrating || !hadDeepLink) {
            return;
        }
        if (selected.length > 0) {
            hasAutoRun.current = true;
            run(selected.map((player) => player.id));
        }
    }, [isHydrating, hadDeepLink, selected, run]);

    const canSearch = selected.length > 0 && !isLoading && !isHydrating;

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
                        isBusy={isHydrating}
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

            {hydrationError ? (
                <div className="text-destructive bg-destructive/10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                    <AlertCircleIcon className="size-4 shrink-0" />
                    {hydrationError}
                </div>
            ) : null}

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

            {isLoading || isHydrating ? (
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
                                : 'These players were never recorded in the same instance.'}
                        </EmptyDescription>
                    </div>
                </Empty>
            ) : (
                <SessionTable
                    sessions={filteredResults}
                    copiedKey={copiedKey}
                    onCopy={(key, session) =>
                        copy(key, buildLaunchUri(session.location))
                    }
                />
            )}
        </div>
    );
}
