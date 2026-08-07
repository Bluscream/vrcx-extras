import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(resetAfterMs = 2000) {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    const copy = useCallback(
        async (key: string, text: string) => {
            try {
                await navigator.clipboard.writeText(text);
            } catch (cause) {
                console.warn('Clipboard write failed:', cause);
                return false;
            }

            setCopiedKey(key);
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            timerRef.current = setTimeout(
                () => setCopiedKey(null),
                resetAfterMs
            );
            return true;
        },
        [resetAfterMs]
    );

    return { copiedKey, copy };
}
