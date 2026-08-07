const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
});

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

/** Full precision, e.g. `1h 20m 14s` — used for aggregate totals. */
export function formatPreciseDuration(ms: number) {
    const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    // Always keep seconds so a sub-minute total never renders as an empty string.
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
}

const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto'
});

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
];

/** e.g. `3 days ago`. Returns null when the timestamp is unknown. */
export function formatRelative(ms: number | null) {
    if (!ms) {
        return null;
    }
    const diff = ms - Date.now();
    const magnitude = Math.abs(diff);

    for (const [unit, unitMs] of relativeUnits) {
        if (magnitude >= unitMs) {
            return relativeTimeFormat.format(Math.round(diff / unitMs), unit);
        }
    }
    return 'just now';
}

export function formatDuration(ms: number) {
    const totalMinutes = Math.floor(Math.max(ms, 0) / 60_000);
    if (totalMinutes < 1) {
        return '<1m';
    }
    if (totalMinutes < 60) {
        return `${totalMinutes}m`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function formatDateTime(ms: number) {
    return dateTimeFormat.format(ms);
}

export function formatTime(ms: number) {
    return timeFormat.format(ms);
}

/** Builds the `vrchat://` deep link VRCX uses to launch an instance. */
export function buildLaunchUri(location: string) {
    return `vrchat://launch?ref=vrcx&location=${encodeURIComponent(location)}`;
}

/**
 * Opens a world in VRCX-0 rather than launching VRChat.
 *
 * VRCX-0 registers the `vrcx-0` scheme and accepts only `world/open`,
 * `avatar/open` and `collection/import`, each keyed by a bare id (its
 * `is_world_id` rejects anything but a `wrld_` UUID). There is deliberately no
 * instance form, so this opens the world; the instance itself is only
 * reachable through the `vrchat://` launch link.
 */
export function buildVrcxWorldUri(worldId: string) {
    return `vrcx-0://world/open?id=${encodeURIComponent(worldId)}`;
}
