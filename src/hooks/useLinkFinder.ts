import { useCallback, useEffect, useRef, useState } from 'react';

import { findLinks, isAbortError, toErrorMessage } from '@/api/client';
import type { OverlappingSession } from '@/types';

export function useLinkFinder() {
    const [results, setResults] = useState<OverlappingSession[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    /** Resolves true once results are in; false on error or supersession. */
    const run = useCallback(async (userIds: string[]): Promise<boolean> => {
        if (userIds.length === 0) {
            return false;
        }

        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;

        setIsLoading(true);
        setError(null);

        try {
            setResults(await findLinks(userIds, controller.signal));
            return true;
        } catch (cause) {
            if (isAbortError(cause)) {
                return false;
            }
            setResults([]);
            setError(toErrorMessage(cause));
            return false;
        } finally {
            if (!controller.signal.aborted) {
                setIsLoading(false);
            }
        }
    }, []);

    const reset = useCallback(() => {
        controllerRef.current?.abort();
        setResults(null);
        setError(null);
        setIsLoading(false);
    }, []);

    return { results, isLoading, error, run, reset };
}
