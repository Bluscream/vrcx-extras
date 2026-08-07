import type { AltCandidate, PlayerDetails } from '../shared/api.ts';
import { queryAll } from './db.ts';
import { getDirectory } from './directory.ts';
import { foldName } from './fold.ts';
import { tableExists } from './schema.ts';

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/** Extracts core alpha name without trailing digits or symbol framing. */
function stripDecorations(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\d+$/g, '');
}

export function getPlayerDetails(prefix: string, targetUserId: string): PlayerDetails | null {
    const entries = getDirectory(prefix);
    const targetEntry = entries.find((e) => e.player.id === targetUserId);
    if (!targetEntry) {
        return null;
    }

    const player = targetEntry.player;
    const table = (suffix: string) => `${prefix}${suffix}`;

    // 1. Gather all past display names from history, feeds, and game logs.
    const pastNamesSet = new Set<string>();
    pastNamesSet.add(player.displayName);

    if (tableExists(table('_friend_log_history'))) {
        for (const name of queryAll(
            `SELECT DISTINCT display_name FROM ${table('_friend_log_history')} WHERE user_id = ? AND display_name IS NOT NULL`,
            [targetUserId],
            (row) => row.nonEmptyText('display_name')
        )) {
            if (name) pastNamesSet.add(name);
        }
    }

    if (tableExists('gamelog_join_leave')) {
        for (const name of queryAll(
            `SELECT DISTINCT display_name FROM gamelog_join_leave WHERE user_id = ? AND display_name IS NOT NULL`,
            [targetUserId],
            (row) => row.nonEmptyText('display_name')
        )) {
            if (name) pastNamesSet.add(name);
        }
    }

    const pastNames = [...pastNamesSet];

    // 2. Gather top companions (users present in the same instances).
    const companionCounts = new Map<string, { displayName: string; count: number }>();
    if (tableExists('gamelog_join_leave')) {
        const targetLocations = queryAll(
            `SELECT DISTINCT location FROM gamelog_join_leave WHERE user_id = ?`,
            [targetUserId],
            (row) => row.nonEmptyText('location')
        ).filter((loc): loc is string => Boolean(loc));

        if (targetLocations.length > 0) {
            const locSlice = targetLocations.slice(0, 200);
            const placeholders = locSlice.map(() => '?').join(', ');
            for (const record of queryAll(
                `SELECT user_id, display_name, COUNT(DISTINCT location) as shared_count
                 FROM gamelog_join_leave
                 WHERE location IN (${placeholders}) AND user_id != ? AND user_id IS NOT NULL AND user_id != ''
                 GROUP BY user_id`,
                [...locSlice, targetUserId],
                (row) => ({
                    userId: row.nonEmptyText('user_id'),
                    displayName: row.nonEmptyText('display_name'),
                    count: row.numberOrNull('shared_count') ?? 0
                })
            )) {
                if (record.userId) {
                    companionCounts.set(record.userId, {
                        displayName: record.displayName ?? record.userId,
                        count: record.count
                    });
                }
            }
        }
    }

    const topCompanions = [...companionCounts.entries()]
        .map(([userId, info]) => ({
            userId,
            displayName: info.displayName,
            sharedInstances: info.count
        }))
        .sort((a, b) => b.sharedInstances - a.sharedInstances)
        .slice(0, 15);

    // 3. Find potential alt accounts across the directory
    const targetFolded = foldName(player.displayName);
    const targetCore = stripDecorations(player.displayName);
    const altCandidates: AltCandidate[] = [];

    for (const entry of entries) {
        if (entry.player.id === targetUserId) continue;

        const candidateName = entry.player.displayName;
        const candidateFolded = foldName(candidateName);
        const candidateCore = stripDecorations(candidateName);

        const reasons: string[] = [];
        let score = 0;

        // Check exact folded key match (e.g. decorative font / symbol variation)
        const hasFoldedMatch = targetFolded.some(
            (tf) => tf.length >= 3 && candidateFolded.some((cf) => cf.length >= 3 && (cf.includes(tf) || tf.includes(cf)))
        );
        if (hasFoldedMatch) {
            score += 70;
            reasons.push('Identical normalized name structure');
        }

        // Check core name similarity without numbers/decorations
        if (targetCore && candidateCore) {
            if (targetCore === candidateCore) {
                score += 80;
                reasons.push('Matching base name (numbers or symbols differ)');
            } else if (
                targetCore.length >= 4 &&
                candidateCore.length >= 4 &&
                (candidateCore.includes(targetCore) || targetCore.includes(candidateCore))
            ) {
                score += 60;
                reasons.push('Substantial base name overlap');
            } else {
                const dist = levenshteinDistance(targetCore, candidateCore);
                if (dist <= 2 && Math.min(targetCore.length, candidateCore.length) >= 5) {
                    score += 45;
                    reasons.push(`High name similarity (edit distance ${dist})`);
                }
            }
        }

        // Check past names overlap
        for (const pastName of pastNames) {
            if (pastName === candidateName) {
                score += 90;
                reasons.push(`Uses a previous display name (${pastName})`);
                break;
            }
        }

        // Check co-presence correlation
        const companionData = companionCounts.get(entry.player.id);
        if (companionData && companionData.count > 0) {
            if (score > 0) {
                score += Math.min(companionData.count * 10, 40);
                reasons.push(`Recorded in ${companionData.count} of the same instances`);
            }
        }

        if (score >= 40) {
            altCandidates.push({
                player: entry.player,
                score,
                reasons
            });
        }
    }

    altCandidates.sort((a, b) => b.score - a.score);

    return {
        player,
        pastNames,
        topCompanions,
        potentialAlts: altCandidates.slice(0, 20)
    };
}
