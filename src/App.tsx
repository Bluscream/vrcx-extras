import { useCallback, useEffect, useState } from 'react';

import { fetchDatabaseStatus, isAbortError, toErrorMessage } from '@/api/client';
import { AppSidebar, navItems } from '@/components/layout/AppSidebar';
import { AppStatusBar } from '@/components/layout/AppStatusBar';
import { AppTitleBar } from '@/components/layout/AppTitleBar';
import { LinkFinderPage } from '@/features/links/LinkFinderPage';
import { useTheme } from '@/hooks/useTheme';
import type { DatabaseStatus } from '@/types';

export default function App() {
    const { theme, toggleTheme } = useTheme();
    const [activeNav, setActiveNav] = useState(navItems[0].id);
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

    const handleResultCountChange = useCallback(
        (count: number | null) => setResultCount(count),
        []
    );

    return (
        <div className="vrcx-0-app-root flex h-full flex-col">
            <AppTitleBar theme={theme} onToggleTheme={toggleTheme} />

            <div className="flex min-h-0 flex-1">
                <AppSidebar activeId={activeNav} onSelect={setActiveNav} />

                <main className="vrcx-0-main-shell min-w-0 flex-1 overflow-y-auto">
                    <LinkFinderPage
                        onResultCountChange={handleResultCountChange}
                    />
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
