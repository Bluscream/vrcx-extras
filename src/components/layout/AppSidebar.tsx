import { NavLink } from 'react-router';

import { navRoutes } from '@/app/routes';
import { cn } from '@/lib/utils';

export function AppSidebar() {
    return (
        <nav
            aria-label="Primary"
            className="vrcx-0-sidebar-surface flex w-13 shrink-0 flex-col items-center gap-1 border-r py-2"
        >
            {navRoutes.map((route) => {
                const Icon = route.icon;
                return (
                    <NavLink
                        key={route.path}
                        to={route.path}
                        title={route.label}
                        aria-label={route.label}
                        className={({ isActive }) =>
                            cn(
                                'focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-3 [&_svg]:size-4.5',
                                isActive
                                    ? 'bg-sidebar-accent text-foreground'
                                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                            )
                        }
                    >
                        <Icon />
                    </NavLink>
                );
            })}
        </nav>
    );
}
