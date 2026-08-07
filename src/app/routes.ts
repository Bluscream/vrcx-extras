import { LinkIcon, type LucideIcon } from 'lucide-react';

export interface NavRoute {
    path: string;
    label: string;
    icon: LucideIcon;
}

/** Sidebar entries, in display order. Also drives route registration. */
export const navRoutes: NavRoute[] = [
    { path: '/player-links', label: 'Instance Links', icon: LinkIcon }
];

export const defaultRoute = navRoutes[0].path;

/** Query parameter carrying pre-selected user ids on the links route. */
export const USERS_PARAM = 'users';

export function parseUserIdsParam(value: string | null) {
    return [
        ...new Set(
            (value ?? '')
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
        )
    ];
}
