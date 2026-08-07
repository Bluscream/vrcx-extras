import type { SearchResultItem, UnifiedSearchResults } from '../shared/api.ts';
import { queryAll } from './db.ts';
import { getDirectory, searchDirectory } from './directory.ts';
import { tableExists } from './schema.ts';

const APP_PAGES: SearchResultItem[] = [
    {
        id: 'page_links',
        category: 'pages',
        title: 'Instance Links',
        subtitle: 'Find overlapping meetups and session timelines between players',
        targetUrl: '/player-links'
    },
    {
        id: 'page_search',
        category: 'pages',
        title: 'Player Intelligence & Universal Search',
        subtitle: 'Inspect player history, frequent companions, and alt accounts',
        targetUrl: '/search'
    }
];

function searchWorlds(query: string, limit = 20): SearchResultItem[] {
    const rawQuery = query.trim().toLowerCase();
    if (!rawQuery) return [];

    const results: SearchResultItem[] = [];

    if (tableExists('cache_world')) {
        for (const row of queryAll(
            `SELECT id, name, author_name, description, thumbnail_image_url
             FROM cache_world
             WHERE LOWER(name) LIKE ? OR LOWER(author_name) LIKE ? OR LOWER(id) LIKE ?
             LIMIT ?`,
            [`%${rawQuery}%`, `%${rawQuery}%`, `%${rawQuery}%`, limit],
            (r) => ({
                id: r.textOrNull('id'),
                name: r.textOrNull('name'),
                authorName: r.textOrNull('author_name') ?? '',
                description: r.textOrNull('description') ?? '',
                thumbnailUrl: r.textOrNull('thumbnail_image_url') ?? undefined
            })
        )) {
            if (!row.id) continue;
            results.push({
                id: row.id,
                category: 'worlds',
                title: row.name ?? row.id,
                subtitle: row.authorName ? `by ${row.authorName} • ${row.id}` : row.id,
                imageUrl: row.thumbnailUrl,
                targetUrl: `/search?id=${encodeURIComponent(row.id)}`
            });
        }
    }

    // Also check gamelog_location for visited worlds not in cache_world
    if (results.length < limit && tableExists('gamelog_location')) {
        const seenIds = new Set(results.map((r) => r.id));
        for (const row of queryAll(
            `SELECT DISTINCT world_id, world_name
             FROM gamelog_location
             WHERE (LOWER(world_name) LIKE ? OR LOWER(world_id) LIKE ?)
               AND world_id IS NOT NULL AND world_id != ''
             LIMIT ?`,
            [`%${rawQuery}%`, `%${rawQuery}%`, limit],
            (r) => ({
                worldId: r.nonEmptyText('world_id'),
                worldName: r.nonEmptyText('world_name')
            })
        )) {
            if (row.worldId && !seenIds.has(row.worldId)) {
                results.push({
                    id: row.worldId,
                    category: 'worlds',
                    title: row.worldName ?? row.worldId,
                    subtitle: row.worldId,
                    targetUrl: `/search?id=${encodeURIComponent(row.worldId)}`
                });
                seenIds.add(row.worldId);
            }
        }
    }

    return results.slice(0, limit);
}

function searchAvatars(query: string, limit = 20): SearchResultItem[] {
    const rawQuery = query.trim().toLowerCase();
    if (!rawQuery) return [];

    const results: SearchResultItem[] = [];

    if (tableExists('cache_avatar')) {
        for (const row of queryAll(
            `SELECT id, name, author_name, description, thumbnail_image_url
             FROM cache_avatar
             WHERE LOWER(name) LIKE ? OR LOWER(author_name) LIKE ? OR LOWER(id) LIKE ?
             LIMIT ?`,
            [`%${rawQuery}%`, `%${rawQuery}%`, `%${rawQuery}%`, limit],
            (r) => ({
                id: r.textOrNull('id'),
                name: r.textOrNull('name'),
                authorName: r.textOrNull('author_name') ?? '',
                thumbnailUrl: r.textOrNull('thumbnail_image_url') ?? undefined
            })
        )) {
            if (!row.id) continue;
            results.push({
                id: row.id,
                category: 'avatars',
                title: row.name ?? row.id,
                subtitle: row.authorName ? `by ${row.authorName} • ${row.id}` : row.id,
                imageUrl: row.thumbnailUrl,
                targetUrl: `/search?id=${encodeURIComponent(row.id)}`
            });
        }
    }

    return results.slice(0, limit);
}

function searchInstances(query: string, limit = 20): SearchResultItem[] {
    const rawQuery = query.trim().toLowerCase();
    if (!rawQuery) return [];

    const results: SearchResultItem[] = [];

    if (tableExists('gamelog_location')) {
        for (const row of queryAll(
            `SELECT DISTINCT location, world_name, created_at
             FROM gamelog_location
             WHERE (LOWER(location) LIKE ? OR LOWER(world_name) LIKE ?)
               AND location IS NOT NULL AND location != ''
             ORDER BY id DESC
             LIMIT ?`,
            [`%${rawQuery}%`, `%${rawQuery}%`, limit],
            (r) => ({
                location: r.nonEmptyText('location'),
                worldName: r.textOrNull('world_name') ?? '',
                createdAt: r.textOrNull('created_at') ?? ''
            })
        )) {
            if (row.location) {
                const rest = row.location.includes(':') ? row.location.slice(row.location.indexOf(':') + 1) : row.location;
                const displayTitle = rest.startsWith('#') ? rest : `#${rest}`;
                const displaySubtitle = row.worldName ? `World: ${row.worldName}` : undefined;
                results.push({
                    id: row.location,
                    category: 'instances',
                    title: displayTitle,
                    subtitle: displaySubtitle,
                    targetUrl: `/search?id=${encodeURIComponent(row.location)}`
                });
            }
        }
    }

    return results.slice(0, limit);
}

export function performUnifiedSearch(prefix: string, query: string): UnifiedSearchResults {
    const rawQuery = query.trim().toLowerCase();

    // Pages matching
    const matchingPages = rawQuery
        ? APP_PAGES.filter(
              (page) =>
                  page.title.toLowerCase().includes(rawQuery) ||
                  (page.subtitle && page.subtitle.toLowerCase().includes(rawQuery))
          )
        : APP_PAGES;

    // Players matching
    const entries = getDirectory(prefix);
    const matchedPlayers = searchDirectory(entries, query, 30).map((player): SearchResultItem => ({
        id: player.id,
        category: 'players',
        title: player.displayName,
        subtitle: player.trustLevel ? `${player.trustLevel} • ${player.id}` : player.id,
        targetUrl: `/search?id=${encodeURIComponent(player.id)}`
    }));

    // Scraped database queries for worlds, avatars, and instances
    const matchedWorlds = searchWorlds(query, 20);
    const matchedAvatars = searchAvatars(query, 20);
    const matchedInstances = searchInstances(query, 20);

    return {
        players: matchedPlayers,
        worlds: matchedWorlds,
        avatars: matchedAvatars,
        instances: matchedInstances,
        pages: matchingPages
    };
}
