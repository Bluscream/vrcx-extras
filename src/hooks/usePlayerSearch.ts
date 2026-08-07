import { useEffect, useState } from 'react';

import { isAbortError, searchPlayers, toErrorMessage } from '@/api/client';
import type { Player } from '@/types';

import { useDebouncedValue } from './useDebouncedValue';

export function usePlayerSearch(query: string) {
    const debouncedQuery = useDebouncedValue(query.trim(), 200);
    const [candidates, setCandidates] = useState<Player[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!debouncedQuery) {
            setCandidates([]);
            setError(null);
            setIsSearching(false);
            return;
        }

        // Aborting on re-run is what keeps a slow earlier response from
        // overwriting the results of a newer keystroke.
        const controller = new AbortController();
        setIsSearching(true);

        searchPlayers(debouncedQuery, controller.signal)
            .then((players) => {
                setCandidates(players);
                setError(null);
            })
            .catch((cause) => {
                if (isAbortError(cause)) {
                    return;
                }
                setCandidates([]);
                setError(toErrorMessage(cause));
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
            });

        return () => controller.abort();
    }, [debouncedQuery]);

    return { candidates, isSearching, error };
}
