import { LinkIcon, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface NavItem {
    id: string;
    label: string;
    icon: LucideIcon;
}

export const navItems: NavItem[] = [
    { id: 'links', label: 'Instance Links', icon: LinkIcon }
];

export function AppSidebar({
    activeId,
    onSelect
}: {
    activeId: string;
    onSelect: (id: string) => void;
}) {
    return (
        <nav
            aria-label="Primary"
            className="vrcx-0-sidebar-surface flex w-13 shrink-0 flex-col items-center gap-1 border-r py-2"
        >
            {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeId;
                return (
                    <button
                        key={item.id}
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => onSelect(item.id)}
                        className={cn(
                            'focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-3 [&_svg]:size-4.5',
                            isActive
                                ? 'bg-sidebar-accent text-foreground'
                                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                        )}
                    >
                        <Icon />
                    </button>
                );
            })}
        </nav>
    );
}
