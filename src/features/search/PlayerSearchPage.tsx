import { AlertCircleIcon, BoxIcon, ExternalLinkIcon, FileTextIcon, GlobeIcon, LayersIcon, SearchIcon, SparklesIcon, TagIcon, UserIcon, UsersIcon, UserSearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { fetchEntityDetails, isAbortError, toErrorMessage, unifiedSearch } from '@/api/client';
import { ExportDropdown } from '@/components/ExportDropdown';
import { PageHeader, PageShell } from '@/components/layout/PageHeader';
import { PlayerMarkers } from '@/features/links/PlayerMarkers';
import { formatRelative } from '@/lib/format';
import type { EntityDetailsResponse, UnifiedSearchResults } from '@/types';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/ui/empty';
import { Spinner } from '@/ui/spinner';

/** Flattens the per-category search results into one plain row list. */
function toExportRows(results: UnifiedSearchResults) {
    return Object.entries(results).flatMap(([category, items]) =>
        (items as UnifiedSearchResults['players']).map((item) => ({
            category,
            title: item.title,
            subtitle: item.subtitle ?? '',
            id: item.id,
            url: item.targetUrl
        }))
    );
}

export function PlayerSearchPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const selectedEntityId = searchParams.get('id');
    const searchQuery = searchParams.get('q') ?? '';

    const [entityDetails, setEntityDetails] = useState<EntityDetailsResponse | null>(null);
    const [searchResults, setSearchResults] = useState<UnifiedSearchResults | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch entity details if ?id=... is present
    useEffect(() => {
        if (!selectedEntityId) {
            setEntityDetails(null);
            if (!searchQuery) {
                setError(null);
                setIsLoading(false);
            }
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);

        fetchEntityDetails(selectedEntityId, controller.signal)
            .then((data) => {
                setEntityDetails(data);
                setError(null);
            })
            .catch((cause) => {
                if (isAbortError(cause)) return;
                setEntityDetails(null);
                setError(toErrorMessage(cause));
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [selectedEntityId, searchQuery]);

    // Fetch unified search results if ?q=... is present and no entity selected
    useEffect(() => {
        if (selectedEntityId || !searchQuery) {
            setSearchResults(null);
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);

        unifiedSearch(searchQuery, controller.signal)
            .then((data) => {
                setSearchResults(data);
                setError(null);
            })
            .catch((cause) => {
                if (isAbortError(cause)) return;
                setSearchResults(null);
                setError(toErrorMessage(cause));
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [searchQuery, selectedEntityId]);

    function selectEntity(id: string) {
        setSearchParams({ id });
    }

    function jumpToLinks(userIds: string[]) {
        const query = new URLSearchParams();
        query.set('users', userIds.join(','));
        navigate(`/player-links?${query.toString()}`);
    }

    return (
        <PageShell width="prose" className="gap-6">
            <PageHeader
                icon={UserSearchIcon}
                title={entityDetails ? 'Entity Details' : 'Universal Search'}
                description="Search players, worlds, avatars and instances recorded in your VRCX database."
                actions={
                    <ExportDropdown
                        title={`Search Results — ${searchQuery}`}
                        filenamePrefix="search_results"
                        data={searchResults ? toExportRows(searchResults) : []}
                    />
                }
            />

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Spinner className="size-6" />
                </div>
            ) : error ? (
                <Empty>
                    <EmptyMedia>
                        <AlertCircleIcon className="text-destructive size-10" />
                    </EmptyMedia>
                    <EmptyTitle>Error loading details</EmptyTitle>
                    <EmptyDescription>{error}</EmptyDescription>
                </Empty>
            ) : entityDetails ? (
                /* Detail Views for Player, World, Avatar, or Instance */
                <div>
                    {/* PLAYER DETAIL VIEW */}
                    {entityDetails.type === 'player' && entityDetails.player && (
                        <div className="grid gap-6 md:grid-cols-3">
                            <Card className="md:col-span-1">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <PlayerMarkers player={entityDetails.player.player} />
                                        <span className="truncate">{entityDetails.player.player.displayName}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">User ID</span>
                                        <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs select-all">
                                            {entityDetails.player.player.id}
                                        </code>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">Last Seen</span>
                                        <span>{formatRelative(entityDetails.player.player.lastSeen) ?? 'Never'}</span>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">Recorded Encounters</span>
                                        <span>{entityDetails.player.player.sessionCount} sessions</span>
                                    </div>

                                    {entityDetails.player.pastNames.length > 1 && (
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-muted-foreground text-xs font-medium">Known Name History</span>
                                            <div className="flex flex-wrap gap-1">
                                                {entityDetails.player.pastNames.map((name) => (
                                                    <Badge key={name} variant="outline" className="text-xs">
                                                        {name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 w-full gap-2"
                                        onClick={() => jumpToLinks([entityDetails.player!.player.id])}
                                    >
                                        <ExternalLinkIcon className="size-3.5" />
                                        View Sessions & Meetups
                                    </Button>
                                </CardContent>
                            </Card>

                            <div className="flex flex-col gap-6 md:col-span-2">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <SparklesIcon className="text-primary size-4" />
                                            Potential Alt Accounts ({entityDetails.player.potentialAlts.length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {entityDetails.player.potentialAlts.length === 0 ? (
                                            <p className="text-muted-foreground text-sm">
                                                No strong alt candidates detected based on name similarity or co-presence.
                                            </p>
                                        ) : (
                                            <div className="flex flex-col divide-y">
                                                {entityDetails.player.potentialAlts.map((alt) => (
                                                    <div
                                                        key={alt.player.id}
                                                        className="flex items-start justify-between py-2.5 first:pt-0 last:pb-0"
                                                    >
                                                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <PlayerMarkers player={alt.player} />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => selectEntity(alt.player.id)}
                                                                    className="hover:underline font-medium text-sm text-left truncate"
                                                                >
                                                                    {alt.player.displayName}
                                                                </button>
                                                                <Badge variant="secondary" className="text-[0.65rem] px-1.5">
                                                                    Score {alt.score}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                                                                {alt.reasons.map((reason, idx) => (
                                                                    <span key={idx} className="inline-flex items-center gap-1">
                                                                        • {reason}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="xs"
                                                            className="shrink-0 gap-1 text-xs"
                                                            onClick={() => jumpToLinks([entityDetails.player!.player.id, alt.player.id])}
                                                        >
                                                            <UsersIcon className="size-3" />
                                                            Find Links
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <UsersIcon className="text-muted-foreground size-4" />
                                            Frequent Companions ({entityDetails.player.topCompanions.length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {entityDetails.player.topCompanions.length === 0 ? (
                                            <p className="text-muted-foreground text-sm">
                                                No shared game log instances found.
                                            </p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {entityDetails.player.topCompanions.map((companion) => (
                                                    <div
                                                        key={companion.userId}
                                                        className="border rounded-md p-2 flex items-center justify-between gap-2"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => selectEntity(companion.userId)}
                                                                className="truncate text-xs font-medium hover:underline text-left block w-full"
                                                            >
                                                                {companion.displayName}
                                                            </button>
                                                            <div className="text-[0.7rem] text-muted-foreground">
                                                                {companion.sharedInstances} shared instances
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="xs"
                                                            onClick={() => jumpToLinks([entityDetails.player!.player.id, companion.userId])}
                                                            className="size-7 p-0"
                                                            title={`Check overlapping sessions with ${companion.displayName}`}
                                                        >
                                                            <UsersIcon className="size-3.5" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}

                    {/* WORLD DETAIL VIEW */}
                    {entityDetails.type === 'world' && entityDetails.world && (
                        <div className="grid gap-6 md:grid-cols-3">
                            <Card className="md:col-span-1">
                                {entityDetails.world.imageUrl && (
                                    <img
                                        src={entityDetails.world.imageUrl}
                                        alt={entityDetails.world.name}
                                        className="h-44 w-full object-cover rounded-t-xl"
                                    />
                                )}
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <GlobeIcon className="size-4 text-primary shrink-0" />
                                        <span className="truncate">{entityDetails.world.name}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">World ID</span>
                                        <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs select-all">
                                            {entityDetails.world.id}
                                        </code>
                                    </div>

                                    {entityDetails.world.authorName && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground text-xs font-medium">Author</span>
                                            <span>{entityDetails.world.authorName}</span>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">Recorded Visits</span>
                                        <span>{entityDetails.world.visitCount} visits</span>
                                    </div>

                                    {entityDetails.world.isFavorite && (
                                        <div className="flex items-center gap-1.5">
                                            <Badge variant="secondary" className="text-xs">
                                                ★ Favorite ({entityDetails.world.favoriteGroup})
                                            </Badge>
                                        </div>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 w-full gap-2"
                                        onClick={() => (window.location.href = `vrcx-0://world/${entityDetails.world!.id}`)}
                                    >
                                        <ExternalLinkIcon className="size-3.5" />
                                        Launch World in VRCX
                                    </Button>

                                    <a
                                        href={`https://vrchat.com/home/world/${entityDetails.world.id}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 text-xs font-medium transition-colors py-1"
                                    >
                                        <ExternalLinkIcon className="size-3" />
                                        Show World on VRChat.com
                                    </a>
                                </CardContent>
                            </Card>

                            <div className="flex flex-col gap-6 md:col-span-2">
                                {entityDetails.world.description && (
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-semibold">Description</CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
                                            {entityDetails.world.description}
                                        </CardContent>
                                    </Card>
                                )}

                                {entityDetails.world.recentVisits.length > 0 && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <LayersIcon className="size-4 text-muted-foreground" />
                                                Recent Visit History ({entityDetails.world.recentVisits.length})
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex flex-col divide-y border rounded-lg">
                                                {entityDetails.world.recentVisits.map((visit, idx) => {
                                                    const displayLoc = visit.location.includes(':')
                                                        ? visit.location.slice(visit.location.indexOf(':') + 1)
                                                        : visit.location;
                                                    const formattedLoc = displayLoc.startsWith('#') ? displayLoc : `#${displayLoc}`;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            onClick={() => selectEntity(visit.location)}
                                                            className="p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-accent/40 transition-colors"
                                                        >
                                                            <span className="font-mono text-foreground hover:underline truncate max-w-md">{formattedLoc}</span>
                                                            <span className="text-muted-foreground">{new Date(visit.createdAt).toLocaleString()}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AVATAR DETAIL VIEW */}
                    {entityDetails.type === 'avatar' && entityDetails.avatar && (
                        <div className="grid gap-6 md:grid-cols-3">
                            <Card className="md:col-span-1">
                                {entityDetails.avatar.imageUrl && (
                                    <img
                                        src={entityDetails.avatar.imageUrl}
                                        alt={entityDetails.avatar.name}
                                        className="h-44 w-full object-cover rounded-t-xl"
                                    />
                                )}
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BoxIcon className="size-4 text-primary shrink-0" />
                                        <span className="truncate">{entityDetails.avatar.name}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">Avatar ID</span>
                                        <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs select-all">
                                            {entityDetails.avatar.id}
                                        </code>
                                    </div>

                                    {entityDetails.avatar.authorName && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground text-xs font-medium">Author</span>
                                            <span>{entityDetails.avatar.authorName}</span>
                                        </div>
                                    )}

                                    {entityDetails.avatar.tags.length > 0 && (
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-muted-foreground text-xs font-medium">Tags</span>
                                            <div className="flex flex-wrap gap-1">
                                                {entityDetails.avatar.tags.map((t) => (
                                                    <Badge key={t.tag} variant="outline" className="text-xs gap-1">
                                                        <TagIcon className="size-3" style={{ color: t.color }} />
                                                        {t.tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 w-full gap-2"
                                        onClick={() => (window.location.href = `vrcx-0://avatar/${entityDetails.avatar!.id}`)}
                                    >
                                        <ExternalLinkIcon className="size-3.5" />
                                        Launch Avatar in VRCX
                                    </Button>
                                </CardContent>
                            </Card>

                            <div className="flex flex-col gap-6 md:col-span-2">
                                {entityDetails.avatar.description && (
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-semibold">Description</CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
                                            {entityDetails.avatar.description}
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}

                    {/* INSTANCE DETAIL VIEW */}
                    {entityDetails.type === 'instance' && entityDetails.instance && (
                        <div className="grid gap-6 md:grid-cols-3">
                            <Card className="md:col-span-1">
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <LayersIcon className="size-4 text-primary shrink-0" />
                                        <button
                                            type="button"
                                            onClick={() => selectEntity(entityDetails.instance!.worldId)}
                                            className="truncate text-left hover:underline"
                                        >
                                            {entityDetails.instance.worldName}
                                        </button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">Instance ID</span>
                                        <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs select-all">
                                            #{entityDetails.instance.instanceId}
                                        </code>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <span className="text-muted-foreground text-xs font-medium">Access Type</span>
                                        <Badge variant="secondary" className="w-fit">{entityDetails.instance.accessType}</Badge>
                                    </div>

                                    {entityDetails.instance.lastVisitedAt && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-muted-foreground text-xs font-medium">Last Visited</span>
                                            <span>{new Date(entityDetails.instance.lastVisitedAt).toLocaleString()}</span>
                                        </div>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-2 w-full gap-2"
                                        onClick={() => (window.location.href = `vrcx-0://world/${encodeURIComponent(entityDetails.instance!.location)}`)}
                                    >
                                        <ExternalLinkIcon className="size-3.5" />
                                        Join Instance in VRCX
                                    </Button>
                                </CardContent>
                            </Card>

                            <div className="flex flex-col gap-6 md:col-span-2">
                                {entityDetails.instance.roster && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                <UsersIcon className="size-4 text-muted-foreground" />
                                                Recorded Instance Roster ({entityDetails.instance.roster.total} Players)
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex flex-wrap gap-1.5">
                                                {entityDetails.instance.roster.names.map((name) => (
                                                    <Badge key={name} variant="outline" className="text-xs">
                                                        {name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : searchResults ? (
                /* Generic Search Results Overview */
                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <SearchIcon className="size-4" />
                                Search Results for "{searchQuery}"
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-6">
                            {searchResults.pages.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Navigation Pages ({searchResults.pages.length})
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {searchResults.pages.map((item) => (
                                            <div
                                                key={item.id}
                                                className="border rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
                                                onClick={() => navigate(item.targetUrl)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <FileTextIcon className="size-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{item.title}</div>
                                                        {item.subtitle && (
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Players */}
                            <div className="flex flex-col gap-2">
                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Players ({searchResults.players.length})
                                </div>
                                {searchResults.players.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No matching players found.</p>
                                ) : (
                                    <div className="flex flex-col divide-y border rounded-lg">
                                        {searchResults.players.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-accent/40 transition-colors"
                                                onClick={() => selectEntity(item.id)}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <UserIcon className="size-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{item.title}</div>
                                                        {item.subtitle && (
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="xs" className="gap-1 text-xs">
                                                    Inspect Profile
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Worlds */}
                            {searchResults.worlds.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Worlds ({searchResults.worlds.length})
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {searchResults.worlds.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => selectEntity(item.id)}
                                                className="border rounded-lg p-3 flex items-center justify-between hover:bg-accent/50 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.title} className="size-9 rounded object-cover shrink-0" />
                                                    ) : (
                                                        <GlobeIcon className="size-5 text-muted-foreground shrink-0" />
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{item.title}</div>
                                                        {item.subtitle && (
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Avatars */}
                            {searchResults.avatars.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Avatars ({searchResults.avatars.length})
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {searchResults.avatars.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => selectEntity(item.id)}
                                                className="border rounded-lg p-3 flex items-center justify-between hover:bg-accent/50 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    {item.imageUrl ? (
                                                        <img src={item.imageUrl} alt={item.title} className="size-9 rounded object-cover shrink-0" />
                                                    ) : (
                                                        <BoxIcon className="size-5 text-muted-foreground shrink-0" />
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{item.title}</div>
                                                        {item.subtitle && (
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Instances */}
                            {searchResults.instances.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Instance Locations ({searchResults.instances.length})
                                    </div>
                                    <div className="flex flex-col divide-y border rounded-lg">
                                        {searchResults.instances.map((item) => (
                                            <div
                                                key={item.id}
                                                onClick={() => selectEntity(item.id)}
                                                className="flex items-center justify-between p-2.5 hover:bg-accent/40 transition-colors cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <LayersIcon className="size-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium text-sm truncate">{item.title}</div>
                                                        {item.subtitle && (
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <Empty>
                    <EmptyMedia>
                        <UserSearchIcon className="text-muted-foreground/40 size-12" />
                    </EmptyMedia>
                    <EmptyTitle>Universal Search</EmptyTitle>
                    <EmptyDescription>
                        Use the search bar above or type <kbd className="border rounded px-1 text-xs bg-muted font-mono">Ctrl+K</kbd> to search players, worlds, avatars, instances, and pages across your VRCX database.
                    </EmptyDescription>
                </Empty>
            )}
        </PageShell>
    );
}
