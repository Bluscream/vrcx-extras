import { LinkIcon, SearchIcon, UsersIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ExportDropdown } from '@/components/ExportDropdown';
import { FilterInput } from '@/components/FilterInput';
import { useReportResultCount } from '@/components/layout/AppShellLayout';
import { PageHeader, PageShell } from '@/components/layout/PageHeader';
import { StatusBanner } from '@/components/StatusBanner';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useLinkFinder } from '@/hooks/useLinkFinder';
import { useSelectedPlayersParam } from '@/hooks/useSelectedPlayersParam';
import { buildLaunchUri, formatDateTime, formatDuration } from '@/lib/format';
import type { OverlappingSession, Player } from '@/types';
import { Button } from '@/ui/button';
import { Card, CardContent } from '@/ui/card';
import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle
} from '@/ui/empty';
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

/** Flattens sessions into one plain row per meetup for CSV/JSON/HTML export. */
function toExportRows(sessions: OverlappingSession[]) {
    return sessions.map((session) => ({
        world: session.worldName,
        world_id: session.worldId,
        location: session.location,
        access_type: session.accessType,
        joined_at: formatDateTime(session.joinedAt),
        left_at: formatDateTime(session.leftAt),
        duration: formatDuration(session.durationMs),
        duration_ms: session.durationMs,
        participants: session.participants
            .map((participant) => participant.displayName)
            .join(', '),
        instance_total_users: session.roster?.total ?? null
    }));
}

export function LinkFinderPage() {
    const onResultCountChange = useReportResultCount();
    const {
        selected,
        updateSelection,
        commitSelectionToUrl,
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

    const search = useCallback(
        async (players: Player[]) => {
            if (await run(players.map((player) => player.id))) {
                commitSelectionToUrl(players);
            }
        },
        [run, commitSelectionToUrl]
    );

    // A deep link should show results without a second click, but only once:
    // afterwards the button drives the search.
    const hasAutoRun = useRef(false);
    useEffect(() => {
        if (hasAutoRun.current || isHydrating || !hadDeepLink) {
            return;
        }
        if (selected.length > 0) {
            hasAutoRun.current = true;
            void search(selected);
        }
    }, [isHydrating, hadDeepLink, selected, search]);

    const canSearch = selected.length > 0 && !isLoading && !isHydrating;

    return (
        <PageShell width="prose">
            <PageHeader
                icon={LinkIcon}
                title="Instance Links"
                description="Find every instance two or more players were recorded in together, straight from your read-only VRCX database."
                actions={
                    <ExportDropdown
                        title="Shared Instances Report"
                        filenamePrefix="instance_links"
                        data={toExportRows(filteredResults ?? [])}
                    />
                }
            />

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
                        onClick={() => void search(selected)}
                    >
                        {isLoading ? <Spinner /> : <SearchIcon />}
                        Search
                    </Button>
                </CardContent>
            </Card>

            {hydrationError ? <StatusBanner>{hydrationError}</StatusBanner> : null}

            {error ? <StatusBanner>{error}</StatusBanner> : null}

            {filteredResults && filteredResults.length > 0 ? (
                <SessionStats sessions={filteredResults} />
            ) : null}

            {results && results.length > 0 ? (
                <FilterInput
                    placeholder="Filter instances…"
                    value={filter}
                    onChange={setFilter}
                    className="sm:self-end"
                />
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
        </PageShell>
    );
}
