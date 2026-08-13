import { queryAll } from './db.ts';
import { getOwnerPrefix } from './schema.ts';
import { tableExists } from './schema.ts';
import type { UserTimelineRow } from '../shared/api.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildUserFilter(
    userIds: string[],
    displayNames: string[],
    idCol: string | null,
    nameCol: string | null
): { where: string; params: (string | number)[] } {
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (idCol && userIds.length > 0) {
        const placeholders = userIds.map(() => '?').join(', ');
        clauses.push(`${idCol} IN (${placeholders})`);
        params.push(...userIds);
    }

    if (nameCol && displayNames.length > 0) {
        const nameClauses = displayNames.map(() => `LOWER(${nameCol}) LIKE ?`).join(' OR ');
        clauses.push(`(${nameClauses})`);
        params.push(...displayNames.map((n) => `%${n.toLowerCase()}%`));
    }

    if (clauses.length === 0) {
        return { where: '1=0', params: [] };
    }

    return { where: clauses.join(' OR '), params };
}

// ─── per-table queries ─────────────────────────────────────────────────────────

function queryJoinLeave(userIds: string[], displayNames: string[]): UserTimelineRow[] {
    if (!tableExists('gamelog_join_leave')) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, type, display_name, user_id, location FROM gamelog_join_leave WHERE ${where} ORDER BY id DESC LIMIT 5000`,
        params,
        (r) => ({
            source: 'gamelog_join_leave',
            type: r.textOrNull('type') ?? 'join_leave',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: `${r.textOrNull('type') ?? ''}${r.textOrNull('location') ? ` @ ${r.textOrNull('location')}` : ''}`,
            raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), type: r.textOrNull('type'), display_name: r.textOrNull('display_name'), user_id: r.textOrNull('user_id'), location: r.textOrNull('location') }
        })
    );
}

function queryExternal(userIds: string[], displayNames: string[]): UserTimelineRow[] {
    if (!tableExists('gamelog_external')) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, message, display_name, user_id, location FROM gamelog_external WHERE ${where} ORDER BY id DESC LIMIT 2000`,
        params,
        (r) => ({
            source: 'gamelog_external',
            type: 'external',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: r.textOrNull('message') ?? '',
            raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), message: r.textOrNull('message'), display_name: r.textOrNull('display_name'), user_id: r.textOrNull('user_id'), location: r.textOrNull('location') }
        })
    );
}

function queryPortalSpawn(displayNames: string[]): UserTimelineRow[] {
    if (!tableExists('gamelog_portal_spawn') || displayNames.length === 0) return [];
    const clauses = displayNames.map(() => 'LOWER(display_name) LIKE ?').join(' OR ');
    return queryAll(
        `SELECT id, created_at, display_name, location FROM gamelog_portal_spawn WHERE ${clauses} ORDER BY id DESC LIMIT 1000`,
        displayNames.map((n) => `%${n.toLowerCase()}%`),
        (r) => ({
            source: 'gamelog_portal_spawn',
            type: 'portal_spawn',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: null,
            display_name: r.textOrNull('display_name'),
            detail: `Portal @ ${r.textOrNull('location') ?? '?'}`,
            raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), display_name: r.textOrNull('display_name'), location: r.textOrNull('location') }
        })
    );
}

function queryFeedGps(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_feed_gps`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, user_id, display_name, location, world_name, previous_location FROM "${tbl}" WHERE ${where} ORDER BY id DESC LIMIT 5000`,
        params,
        (r) => ({
            source: 'feed_gps',
            type: 'gps',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: r.textOrNull('world_name') ?? r.textOrNull('location') ?? '',
            raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), location: r.textOrNull('location'), world_name: r.textOrNull('world_name'), previous_location: r.textOrNull('previous_location') }
        })
    );
}

function queryFeedOnlineOffline(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_feed_online_offline`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, user_id, display_name, type, location, world_name FROM "${tbl}" WHERE ${where} ORDER BY id DESC LIMIT 2000`,
        params,
        (r) => {
            const t = r.textOrNull('type') ?? '';
            const wn = r.textOrNull('world_name') ?? r.textOrNull('location') ?? '';
            return {
                source: 'feed_online_offline',
                type: t || 'online',
                created_at: r.textOrNull('created_at') ?? '',
                user_id: r.textOrNull('user_id'),
                display_name: r.textOrNull('display_name'),
                detail: wn ? `${t} — ${wn}` : t,
                raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), type: t, location: r.textOrNull('location'), world_name: r.textOrNull('world_name') }
            };
        }
    );
}

function queryFeedStatus(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_feed_status`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, user_id, display_name, status, status_description, previous_status, previous_status_description FROM "${tbl}" WHERE ${where} ORDER BY id DESC LIMIT 2000`,
        params,
        (r) => {
            const prev = r.textOrNull('previous_status') ?? '?';
            const next = r.textOrNull('status') ?? '?';
            const desc = r.textOrNull('status_description');
            return {
                source: 'feed_status',
                type: 'status_change',
                created_at: r.textOrNull('created_at') ?? '',
                user_id: r.textOrNull('user_id'),
                display_name: r.textOrNull('display_name'),
                detail: `${prev} → ${next}${desc ? `: ${desc}` : ''}`,
                raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), status: r.textOrNull('status'), status_description: desc, previous_status: r.textOrNull('previous_status'), previous_status_description: r.textOrNull('previous_status_description') }
            };
        }
    );
}

function queryFeedBio(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_feed_bio`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, user_id, display_name, bio, previous_bio FROM "${tbl}" WHERE ${where} ORDER BY id DESC LIMIT 1000`,
        params,
        (r) => ({
            source: 'feed_bio',
            type: 'bio_change',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: r.textOrNull('bio')?.slice(0, 120) ?? '',
            raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), bio: r.textOrNull('bio'), previous_bio: r.textOrNull('previous_bio') }
        })
    );
}

function queryFeedAvatar(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_feed_avatar`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, user_id, display_name, avatar_name, current_avatar_thumbnail_image_url FROM "${tbl}" WHERE ${where} ORDER BY id DESC LIMIT 2000`,
        params,
        (r) => ({
            source: 'feed_avatar',
            type: 'avatar_change',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: r.textOrNull('avatar_name') ?? '',
            raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), avatar_name: r.textOrNull('avatar_name'), current_avatar_thumbnail_image_url: r.textOrNull('current_avatar_thumbnail_image_url') }
        })
    );
}

function queryFriendLog(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_friend_log_history`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT id, created_at, type, user_id, display_name, previous_display_name, trust_level, previous_trust_level, friend_number FROM "${tbl}" WHERE ${where} ORDER BY id DESC LIMIT 2000`,
        params,
        (r) => {
            const t = r.textOrNull('type') ?? '';
            const prev = r.textOrNull('previous_display_name');
            const trust = r.textOrNull('trust_level');
            const parts: string[] = [t];
            if (prev) parts.push(`was: ${prev}`);
            if (trust) parts.push(`trust: ${trust}`);
            return {
                source: 'friend_log_history',
                type: t || 'friend_log',
                created_at: r.textOrNull('created_at') ?? '',
                user_id: r.textOrNull('user_id'),
                display_name: r.textOrNull('display_name'),
                detail: parts.join(' · '),
                raw: { id: r.numberOrNull('id'), created_at: r.textOrNull('created_at'), type: t, user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), previous_display_name: prev, trust_level: trust, previous_trust_level: r.textOrNull('previous_trust_level'), friend_number: r.numberOrNull('friend_number') }
            };
        }
    );
}

function queryNotifications(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_notifications`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'sender_user_id', 'sender_username');
    return queryAll(
        `SELECT id, created_at, type, sender_user_id, sender_username, message, world_id, world_name, invite_message, request_message, response_message FROM "${tbl}" WHERE ${where} ORDER BY created_at DESC LIMIT 2000`,
        params,
        (r) => ({
            source: 'notifications',
            type: r.textOrNull('type') ?? 'notification',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('sender_user_id'),
            display_name: r.textOrNull('sender_username'),
            detail: [r.textOrNull('message'), r.textOrNull('invite_message'), r.textOrNull('request_message'), r.textOrNull('world_name')].filter(Boolean).join(' · ').slice(0, 200),
            raw: { id: r.textOrNull('id'), created_at: r.textOrNull('created_at'), type: r.textOrNull('type'), sender_user_id: r.textOrNull('sender_user_id'), sender_username: r.textOrNull('sender_username'), message: r.textOrNull('message'), world_id: r.textOrNull('world_id'), world_name: r.textOrNull('world_name'), invite_message: r.textOrNull('invite_message'), request_message: r.textOrNull('request_message'), response_message: r.textOrNull('response_message') }
        })
    );
}

function queryNotificationsV2(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_notifications_v2`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'sender_user_id', 'sender_username');
    return queryAll(
        `SELECT id, created_at, type, sender_user_id, sender_username, title, message, link FROM "${tbl}" WHERE ${where} ORDER BY created_at DESC LIMIT 2000`,
        params,
        (r) => ({
            source: 'notifications_v2',
            type: r.textOrNull('type') ?? 'notification',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('sender_user_id'),
            display_name: r.textOrNull('sender_username'),
            detail: [r.textOrNull('title'), r.textOrNull('message')].filter(Boolean).join(': ').slice(0, 200),
            raw: { id: r.textOrNull('id'), created_at: r.textOrNull('created_at'), type: r.textOrNull('type'), sender_user_id: r.textOrNull('sender_user_id'), sender_username: r.textOrNull('sender_username'), title: r.textOrNull('title'), message: r.textOrNull('message'), link: r.textOrNull('link') }
        })
    );
}

function queryModeration(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_moderation`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT user_id, updated_at, display_name, block, mute FROM "${tbl}" WHERE ${where} LIMIT 500`,
        params,
        (r) => ({
            source: 'moderation',
            type: r.boolean('block') ? 'blocked' : r.boolean('mute') ? 'muted' : 'moderation',
            created_at: r.textOrNull('updated_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: [r.boolean('block') ? 'Blocked' : null, r.boolean('mute') ? 'Muted' : null].filter(Boolean).join(', ') || 'none',
            raw: { user_id: r.textOrNull('user_id'), updated_at: r.textOrNull('updated_at'), display_name: r.textOrNull('display_name'), block: r.boolean('block'), mute: r.boolean('mute') }
        })
    );
}

function queryNotes(prefix: string, userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const tbl = `${prefix}_notes`;
    if (!tableExists(tbl)) return [];
    const { where, params } = buildUserFilter(userIds, displayNames, 'user_id', 'display_name');
    return queryAll(
        `SELECT user_id, display_name, note, created_at FROM "${tbl}" WHERE ${where} LIMIT 500`,
        params,
        (r) => ({
            source: 'notes',
            type: 'note',
            created_at: r.textOrNull('created_at') ?? '',
            user_id: r.textOrNull('user_id'),
            display_name: r.textOrNull('display_name'),
            detail: r.textOrNull('note')?.slice(0, 200) ?? '',
            raw: { user_id: r.textOrNull('user_id'), display_name: r.textOrNull('display_name'), note: r.textOrNull('note'), created_at: r.textOrNull('created_at') }
        })
    );
}

// ─── main export ───────────────────────────────────────────────────────────────

export function getUserTimeline(userIds: string[], displayNames: string[]): UserTimelineRow[] {
    const prefix = getOwnerPrefix();

    const rows: UserTimelineRow[] = [
        ...queryJoinLeave(userIds, displayNames),
        ...queryExternal(userIds, displayNames),
        ...queryPortalSpawn(displayNames),
        ...queryFeedGps(prefix, userIds, displayNames),
        ...queryFeedOnlineOffline(prefix, userIds, displayNames),
        ...queryFeedStatus(prefix, userIds, displayNames),
        ...queryFeedBio(prefix, userIds, displayNames),
        ...queryFeedAvatar(prefix, userIds, displayNames),
        ...queryFriendLog(prefix, userIds, displayNames),
        ...queryNotifications(prefix, userIds, displayNames),
        ...queryNotificationsV2(prefix, userIds, displayNames),
        ...queryModeration(prefix, userIds, displayNames),
        ...queryNotes(prefix, userIds, displayNames),
    ];

    rows.sort((a, b) => {
        if (!a.created_at && !b.created_at) return 0;
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return b.created_at.localeCompare(a.created_at);
    });

    return rows;
}
