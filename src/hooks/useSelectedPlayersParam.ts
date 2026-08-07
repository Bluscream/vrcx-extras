import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { isAbortError, resolvePlayers, toErrorMessage } from '@/api/client';
import { parseUserIdsParam, USERS_PARAM } from '@/app/routes';
import type { Player } from '@/types';

/**
 * Keeps the selected players and the `?users=` query parameter in sync, so a
 * link like /player-links?users=usr_a,usr_b restores a selection on open and
 * the current selection is always shareable.
 */
export function useSelectedPlayersParam() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [selected, setSelected] = useState<Player[]>([]);
    // Captured once: whether the URL asked for a selection when this page was
    // opened. Deriving it from the live selection instead would make the first
    // manual pick look like a deep link and auto-fire a search.
    const [hadDeepLink] = useState(
        () => parseUserIdsParam(searchParams.get(USERS_PARAM)).length > 0
    );
    const [isHydrating, setIsHydrating] = useState(hadDeepLink);
    const [hydrationError, setHydrationError] = useState<string | null>(null);

    // Hydration runs once from the URL present at mount; afterwards this hook
    // owns the parameter, so reacting to our own writes would loop.
    const hasHydrated = useRef(false);

    useEffect(() => {
        if (hasHydrated.current) {
            return;
        }
        hasHydrated.current = true;

        const ids = parseUserIdsParam(searchParams.get(USERS_PARAM));
        if (ids.length === 0) {
            return;
        }

        const controller = new AbortController();
        resolvePlayers(ids, controller.signal)
            .then((players) => {
                setSelected(players);
                if (players.length < ids.length) {
                    const found = new Set(players.map((p) => p.id));
                    const missing = ids.filter((id) => !found.has(id));
                    setHydrationError(
                        `Not found in this database: ${missing.join(', ')}`
                    );
                }
            })
            .catch((cause) => {
                if (!isAbortError(cause)) {
                    setHydrationError(toErrorMessage(cause));
                }
            })
            .finally(() => setIsHydrating(false));

        return () => controller.abort();
    }, [searchParams]);

    const updateSelection = useCallback((next: Player[]) => {
        setSelected(next);
    }, []);

    /**
     * Publishes the current selection to the URL. Called once results are in
     * rather than on every pick, so the address bar always describes the
     * results on screen instead of a half-finished selection.
     */
    const commitSelectionToUrl = useCallback(
        (players: Player[]) => {
            setSearchParams(
                (params) => {
                    const updated = new URLSearchParams(params);
                    if (players.length === 0) {
                        updated.delete(USERS_PARAM);
                    } else {
                        updated.set(
                            USERS_PARAM,
                            players.map((player) => player.id).join(',')
                        );
                    }
                    return updated;
                },
                // Searching is not navigation; don't stack history entries the
                // back button has to walk through.
                { replace: true }
            );
        },
        [setSearchParams]
    );

    return {
        selected,
        updateSelection,
        commitSelectionToUrl,
        isHydrating,
        hydrationError,
        /** True when the URL requested a selection as this page was opened. */
        hadDeepLink
    };
}
