/**
 * Intersects two sorted, non-overlapping interval lists.
 * Both inputs must be sorted by `start`.
 */
function intersectIntervals(a, b) {
    const out = [];
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
        const start = Math.max(a[i].start, b[j].start);
        const end = Math.min(a[i].end, b[j].end);

        if (end > start) {
            out.push({
                start,
                end,
                visits: [...a[i].visits, ...b[j].visits]
            });
        }

        // Advance whichever interval ends first — it cannot overlap anything
        // further along in the other list.
        if (a[i].end < b[j].end) {
            i += 1;
        } else {
            j += 1;
        }
    }

    return out;
}

/** Merges touching/overlapping visits by one user into disjoint intervals. */
function toMergedIntervals(visits) {
    const sorted = [...visits].sort((x, y) => x.joinedAt - y.joinedAt);
    const merged = [];

    for (const visit of sorted) {
        const last = merged[merged.length - 1];
        if (last && visit.joinedAt <= last.end) {
            last.end = Math.max(last.end, visit.leftAt);
            last.visits.push(visit);
        } else {
            merged.push({
                start: visit.joinedAt,
                end: visit.leftAt,
                visits: [visit]
            });
        }
    }

    return merged;
}

/**
 * Finds every window during which *all* of `userIds` were simultaneously
 * present, given each user's visits to a single location.
 *
 * The previous implementation only ever looked at each user's first visit to a
 * location, so a second meetup in the same world was never reported.
 */
export function findSimultaneousWindows(visitsByUser, userIds) {
    if (userIds.some((id) => !visitsByUser.get(id)?.length)) {
        return [];
    }

    let windows = toMergedIntervals(visitsByUser.get(userIds[0]));

    for (const userId of userIds.slice(1)) {
        windows = intersectIntervals(
            windows,
            toMergedIntervals(visitsByUser.get(userId))
        );
        if (windows.length === 0) {
            return [];
        }
    }

    return windows;
}

/** One representative participant entry per user for a given window. */
export function summarizeParticipants(window, displayNames = new Map()) {
    const byUser = new Map();

    for (const visit of window.visits) {
        const existing = byUser.get(visit.userId);
        if (existing) {
            existing.joinedAt = Math.min(existing.joinedAt, visit.joinedAt);
            existing.leftAt = Math.max(existing.leftAt, visit.leftAt);
        } else {
            byUser.set(visit.userId, {
                userId: visit.userId,
                displayName:
                    displayNames.get(visit.userId) ?? visit.userId,
                joinedAt: visit.joinedAt,
                leftAt: visit.leftAt
            });
        }
    }

    return [...byUser.values()];
}
