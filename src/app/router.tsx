import { createBrowserRouter, Navigate } from 'react-router';

import { AppShellLayout } from '@/components/layout/AppShellLayout';
import { LinkFinderPage } from '@/features/links/LinkFinderPage';
import { PlayerSearchPage } from '@/features/search/PlayerSearchPage';
import { RegistryBackupPage } from '@/features/registry/RegistryBackupPage';

import { defaultRoute } from './routes';

export const router = createBrowserRouter([
    {
        element: <AppShellLayout />,
        children: [
            { index: true, element: <Navigate to={defaultRoute} replace /> },
            { path: '/player-links', element: <LinkFinderPage /> },
            { path: '/search', element: <PlayerSearchPage /> },
            { path: '/registry', element: <RegistryBackupPage /> },
            { path: '*', element: <Navigate to={defaultRoute} replace /> }
        ]
    }
]);

