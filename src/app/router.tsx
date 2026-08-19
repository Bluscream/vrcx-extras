import { createBrowserRouter, Navigate } from 'react-router';

import { AppShellLayout } from '@/components/layout/AppShellLayout';
import { LinkFinderPage } from '@/features/links/LinkFinderPage';
import { PlayerSearchPage } from '@/features/search/PlayerSearchPage';
import { RegistryBackupPage } from '@/features/registry/RegistryBackupPage';
import { ConfigPage } from '@/features/config/ConfigPage';
import { CommandLinePage } from '@/features/launcher/CommandLinePage';
import { EnvTestingPage } from '@/features/env-testing/EnvTestingPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { UserPage } from '@/features/user/UserPage';

import { defaultRoute } from './routes';

export const router = createBrowserRouter([
    {
        element: <AppShellLayout />,
        children: [
            { index: true, element: <Navigate to={defaultRoute} replace /> },
            { path: '/player-links', element: <LinkFinderPage /> },
            { path: '/search', element: <PlayerSearchPage /> },
            { path: '/user', element: <UserPage /> },
            { path: '/registry', element: <RegistryBackupPage /> },
            { path: '/config', element: <ConfigPage /> },
            { path: '/cmdline', element: <CommandLinePage /> },
            { path: '/env-testing', element: <EnvTestingPage /> },
            { path: '/settings', element: <SettingsPage /> },
            { path: '*', element: <Navigate to={defaultRoute} replace /> }
        ]
    }
]);

