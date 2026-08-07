import type {
    AvatarDetails,
    EntityDetailsResponse,
    InstanceDetails,
    WorldDetails
} from '../shared/api.ts';
import { getPlayerDetails } from './alts.ts';
import { queryAll, queryOne } from './db.ts';
import { parseLocation } from './location.ts';
import { readRosters } from './roster.ts';
import { tableExists } from './schema.ts';

export function getWorldDetails(prefix: string, worldId: string): WorldDetails | null {
    let world: WorldDetails | null = null;

    if (tableExists('cache_world')) {
        world = queryOne(
            `SELECT id, name, author_id, author_name, description, image_url, thumbnail_image_url, release_status, created_at, updated_at, version
             FROM cache_world WHERE id = ?`,
            [worldId],
            (row) => ({
                id: row.text('id'),
                name: row.text('name'),
                authorId: row.textOrNull('author_id'),
                authorName: row.textOrNull('author_name'),
                description: row.textOrNull('description'),
                imageUrl: row.textOrNull('image_url'),
                thumbnailImageUrl: row.textOrNull('thumbnail_image_url'),
                releaseStatus: row.textOrNull('release_status'),
                createdAt: row.textOrNull('created_at'),
                updatedAt: row.textOrNull('updated_at'),
                version: row.numberOrNull('version'),
                memo: null,
                isFavorite: false,
                favoriteGroup: null,
                visitCount: 0,
                lastVisitedAt: null,
                recentVisits: []
            })
        );
    }

    if (!world) {
        // Construct basic world details from game log if not in cache_world
        if (tableExists('gamelog_location')) {
            const row = queryOne(
                `SELECT world_id, world_name FROM gamelog_location WHERE world_id = ? AND world_name IS NOT NULL LIMIT 1`,
                [worldId],
                (r) => ({
                    id: r.nonEmptyText('world_id'),
                    name: r.nonEmptyText('world_name')
                })
            );
            if (row && row.id && row.name) {
                world = {
                    id: row.id,
                    name: row.name,
                    authorId: null,
                    authorName: null,
                    description: null,
                    imageUrl: null,
                    thumbnailImageUrl: null,
                    releaseStatus: null,
                    createdAt: null,
                    updatedAt: null,
                    version: null,
                    memo: null,
                    isFavorite: false,
                    favoriteGroup: null,
                    visitCount: 0,
                    lastVisitedAt: null,
                    recentVisits: []
                };
            }
        }
    }

    if (!world) return null;

    // Check world memo
    if (tableExists('world_memos')) {
        world.memo = queryOne(
            `SELECT memo FROM world_memos WHERE world_id = ?`,
            [worldId],
            (r) => r.textOrNull('memo')
        ) ?? null;
    }

    // Check favorite status
    if (tableExists('favorite_world')) {
        const fav = queryOne(
            `SELECT group_name FROM favorite_world WHERE world_id = ?`,
            [worldId],
            (r) => r.textOrNull('group_name')
        );
        if (fav !== undefined) {
            world.isFavorite = true;
            world.favoriteGroup = fav ?? 'Favorites';
        }
    }

    // Gather visit stats & history from gamelog_location
    if (tableExists('gamelog_location')) {
        const visits = queryAll(
            `SELECT location, created_at FROM gamelog_location WHERE world_id = ? ORDER BY id DESC`,
            [worldId],
            (r) => ({
                location: r.text('location'),
                createdAt: r.text('created_at')
            })
        );
        world.visitCount = visits.length;
        if (visits.length > 0) {
            world.lastVisitedAt = new Date(visits[0].createdAt).getTime();
            world.recentVisits = visits.slice(0, 15);
        }
    }

    return world;
}

export function getAvatarDetails(prefix: string, avatarId: string): AvatarDetails | null {
    let avatar: AvatarDetails | null = null;

    if (tableExists('cache_avatar')) {
        avatar = queryOne(
            `SELECT id, name, author_id, author_name, description, image_url, thumbnail_image_url, release_status, created_at, updated_at, version
             FROM cache_avatar WHERE id = ?`,
            [avatarId],
            (row) => ({
                id: row.text('id'),
                name: row.text('name'),
                authorId: row.textOrNull('author_id'),
                authorName: row.textOrNull('author_name'),
                description: row.textOrNull('description'),
                imageUrl: row.textOrNull('image_url'),
                thumbnailImageUrl: row.textOrNull('thumbnail_image_url'),
                releaseStatus: row.textOrNull('release_status'),
                createdAt: row.textOrNull('created_at'),
                updatedAt: row.textOrNull('updated_at'),
                version: row.numberOrNull('version'),
                memo: null,
                isFavorite: false,
                favoriteGroup: null,
                tags: [],
                usageHistoryCount: 0,
                lastUsedAt: null
            })
        );
    }

    if (!avatar) return null;

    // Check avatar memo
    if (tableExists('avatar_memos')) {
        avatar.memo = queryOne(
            `SELECT memo FROM avatar_memos WHERE avatar_id = ?`,
            [avatarId],
            (r) => r.textOrNull('memo')
        ) ?? null;
    }

    // Check favorite status
    if (tableExists('favorite_avatar')) {
        const fav = queryOne(
            `SELECT group_name FROM favorite_avatar WHERE avatar_id = ?`,
            [avatarId],
            (r) => r.textOrNull('group_name')
        );
        if (fav !== undefined) {
            avatar.isFavorite = true;
            avatar.favoriteGroup = fav ?? 'Favorites';
        }
    }

    // Check avatar tags
    if (tableExists('avatar_tags')) {
        avatar.tags = queryAll(
            `SELECT tag, color FROM avatar_tags WHERE avatar_id = ?`,
            [avatarId],
            (r) => ({
                tag: r.text('tag'),
                color: r.text('color')
            })
        );
    }

    // Check avatar history feed table
    const table = (suffix: string) => `${prefix}${suffix}`;
    const historyTable = table('_avatar_history');
    if (tableExists(historyTable)) {
        const usage = queryAll(
            `SELECT created_at FROM ${historyTable} WHERE avatar_id = ? ORDER BY id DESC`,
            [avatarId],
            (r) => r.text('created_at')
        );
        avatar.usageHistoryCount = usage.length;
        if (usage.length > 0) {
            avatar.lastUsedAt = usage[0];
        }
    }

    return avatar;
}

export function getInstanceDetails(prefix: string, location: string): InstanceDetails | null {
    if (!location) return null;

    const parsed = parseLocation(location);
    const key = location.split('~')[0];

    let worldName = '';
    let groupName: string | null = null;
    let ownerId: string | null = null;
    let recordedVisits = 0;
    let lastVisitedAt: string | null = null;

    if (tableExists('gamelog_location')) {
        const records = queryAll(
            `SELECT world_name, group_name, CAST(owner_id AS TEXT) as owner_id, created_at FROM gamelog_location WHERE location = ? OR location LIKE ? ORDER BY id DESC`,
            [location, `${key}%`],
            (r) => ({
                worldName: r.textOrNull('world_name'),
                groupName: r.textOrNull('group_name'),
                ownerId: r.textOrNull('owner_id'),
                createdAt: r.textOrNull('created_at')
            })
        );

        recordedVisits = records.length;
        if (records.length > 0) {
            worldName = records[0].worldName ?? '';
            groupName = records[0].groupName ?? null;
            ownerId = records[0].ownerId ?? null;
            lastVisitedAt = records[0].createdAt ?? null;
        }
    }

    const rosterMap = readRosters([key]);
    const roster = rosterMap.get(key) ?? null;

    return {
        location,
        worldId: parsed.worldId,
        instanceId: parsed.instanceId,
        worldName: worldName || parsed.worldId,
        accessType: parsed.accessType,
        groupName,
        ownerId,
        recordedVisits,
        lastVisitedAt,
        roster
    };
}

export function getEntityDetails(prefix: string, id: string): EntityDetailsResponse | null {
    if (id.startsWith('usr_')) {
        const player = getPlayerDetails(prefix, id);
        if (player) return { type: 'player', player };
    }

    if (id.startsWith('wrld_')) {
        if (id.includes(':')) {
            const instance = getInstanceDetails(prefix, id);
            if (instance) return { type: 'instance', instance };
        }
        const world = getWorldDetails(prefix, id);
        if (world) return { type: 'world', world };
    }

    if (id.startsWith('avtr_')) {
        const avatar = getAvatarDetails(prefix, id);
        if (avatar) return { type: 'avatar', avatar };
    }

    // Try fallback lookups
    const player = getPlayerDetails(prefix, id);
    if (player) return { type: 'player', player };

    const world = getWorldDetails(prefix, id);
    if (world) return { type: 'world', world };

    const avatar = getAvatarDetails(prefix, id);
    if (avatar) return { type: 'avatar', avatar };

    const instance = getInstanceDetails(prefix, id);
    if (instance) return { type: 'instance', instance };

    return null;
}
