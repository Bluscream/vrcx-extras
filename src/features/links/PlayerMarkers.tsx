import {
    BanIcon,
    type LucideIcon,
    StarIcon,
    StickyNoteIcon,
    UserCheckIcon,
    VolumeXIcon
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { Player } from '@/types';

interface Marker {
    icon: LucideIcon;
    label: string;
    className: string;
    filled?: boolean;
}

/** Relationship markers, ordered strongest signal first. */
function markersFor(player: Player): Marker[] {
    const markers: Marker[] = [];

    if (player.isFavorite) {
        markers.push({
            icon: StarIcon,
            label: 'Favorite',
            className: 'text-status-active',
            filled: true
        });
    }
    if (player.isFriend) {
        markers.push({
            icon: UserCheckIcon,
            label: player.trustLevel
                ? `Friend · ${player.trustLevel}`
                : 'Friend',
            className: 'text-status-online'
        });
    }
    if (player.isBlocked) {
        markers.push({
            icon: BanIcon,
            label: 'Blocked',
            className: 'text-destructive'
        });
    }
    if (player.isMuted) {
        markers.push({
            icon: VolumeXIcon,
            label: 'Muted',
            className: 'text-status-askme'
        });
    }
    if (player.hasNote) {
        markers.push({
            icon: StickyNoteIcon,
            label: 'Has note',
            className: 'text-muted-foreground'
        });
    }

    return markers;
}

export function PlayerMarkers({
    player,
    className
}: {
    player: Player;
    className?: string;
}) {
    const markers = markersFor(player);
    if (markers.length === 0) {
        return null;
    }

    return (
        <span className={cn('flex shrink-0 items-center gap-0.5', className)}>
            {markers.map(({ icon: Icon, label, className: tone, filled }) => (
                <span key={label} title={label} className="inline-flex">
                    <Icon
                        aria-label={label}
                        className={cn('size-3.5', tone)}
                        fill={filled ? 'currentColor' : 'none'}
                    />
                </span>
            ))}
        </span>
    );
}
