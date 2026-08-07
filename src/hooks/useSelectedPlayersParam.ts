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
    const [isHydrating, setIsHydrating] = useState(() =>
        parseUserIdsParam(searchParams.get(USERS_PARAM)).length > 0
    );
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

    const updateSelection = useCallback(
        (next: Player[]) => {
            setSelected(next);
            setSearchParams(
                (params) => {
                    const updated = new URLSearchParams(params);
                    if (next.length === 0) {
                        updated.delete(USERS_PARAM);
                    } else {
                        updated.set(
                            USERS_PARAM,
                            next.map((player) => player.id).join(',')
                        );
                    }
                    return updated;
                },
                // Selecting players is not navigation; don't stack history
                // entries the back button has to walk through.
                { replace: true }
            );
        },
        [setSearchParams]
    );

    return {
        selected,
        updateSelection,
        isHydrating,
        hydrationError,
        /** True when the mount-time URL requested a selection. */
        hadDeepLink: isHydrating || selected.length > 0
    };
}
