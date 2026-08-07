import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState
} from 'react';
import { Outlet } from 'react-router';

import {
    fetchDatabaseStatus,
    isAbortError,
    toErrorMessage
} from '@/api/client';
import { useTheme } from '@/hooks/useTheme';
import type { DatabaseStatus } from '@/types';

import { AppSidebar } from './AppSidebar';
import { AppStatusBar } from './AppStatusBar';
import { AppTitleBar } from './AppTitleBar';

/**
 * Lets the active route publish a count to the shared status bar without the
 * shell needing to know which route is mounted.
 */
const ResultCountContext = createContext<(count: number | null) => void>(
    () => {}
);

export function useReportResultCount() {
    return useContext(ResultCountContext);
}

export function AppShellLayout() {
    const { theme, toggleTheme } = useTheme();
    const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
    const [dbError, setDbError] = useState<string | null>(null);
    const [resultCount, setResultCount] = useState<number | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetchDatabaseStatus(controller.signal)
            .then(setDbStatus)
            .catch((cause) => {
                if (!isAbortError(cause)) {
                    setDbError(toErrorMessage(cause));
                }
            });
        return () => controller.abort();
    }, []);

    const reportResultCount = useCallback(
        (count: number | null) => setResultCount(count),
        []
    );

    return (
        <div className="vrcx-0-app-root flex h-full flex-col">
            <AppTitleBar theme={theme} onToggleTheme={toggleTheme} />

            <div className="flex min-h-0 flex-1">
                <AppSidebar />

                <main className="vrcx-0-main-shell min-w-0 flex-1 overflow-y-auto">
                    <ResultCountContext.Provider value={reportResultCount}>
                        <Outlet />
                    </ResultCountContext.Provider>
                </main>
            </div>

            <AppStatusBar
                status={dbStatus}
                error={dbError}
                resultCount={resultCount}
            />
        </div>
    );
}
