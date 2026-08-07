import { useMemo } from 'react';

import {
    formatDateTime,
    formatDuration,
    formatPreciseDuration
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OverlappingSession } from '@/types';
import { Card, CardContent } from '@/ui/card';

function summarize(sessions: OverlappingSession[]) {
    const totalMs = sessions.reduce(
        (sum, session) => sum + session.durationMs,
        0
    );
    const worlds = new Set(sessions.map((session) => session.worldId));
    const instances = new Set(sessions.map((session) => session.location));
    const starts = sessions.map((session) => session.joinedAt);
    const longest = sessions.reduce(
        (best, session) => Math.max(best, session.durationMs),
        0
    );

    return {
        totalMs,
        sessionCount: sessions.length,
        worldCount: worlds.size,
        instanceCount: instances.size,
        longest,
        averageMs: sessions.length > 0 ? totalMs / sessions.length : 0,
        firstMet: Math.min(...starts),
        lastMet: Math.max(...sessions.map((session) => session.leftAt))
    };
}

function Stat({
    label,
    value,
    hint,
    emphasis = false
}: {
    label: string;
    value: string;
    hint?: string;
    emphasis?: boolean;
}) {
    return (
        <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd
                className={cn(
                    'font-heading truncate font-medium',
                    emphasis ? 'text-base tabular-nums' : 'text-sm'
                )}
                title={hint ?? value}
            >
                {value}
            </dd>
        </div>
    );
}

export function SessionStats({
    sessions
}: {
    sessions: OverlappingSession[];
}) {
    const stats = useMemo(() => summarize(sessions), [sessions]);

    if (sessions.length === 0) {
        return null;
    }

    return (
        <Card size="sm">
            <CardContent>
                {/*
                  * The total leads the row and is given more column width,
                  * since it is the headline figure but reads as part of the
                  * same set as the counts beside it.
                  */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:grid-cols-[1.6fr_repeat(6,1fr)]">
                    <Stat
                        label="Total time together"
                        value={formatPreciseDuration(stats.totalMs)}
                        emphasis
                    />
                    <Stat
                        label="Sessions"
                        value={String(stats.sessionCount)}
                    />
                    <Stat label="Worlds" value={String(stats.worldCount)} />
                    <Stat
                        label="Instances"
                        value={String(stats.instanceCount)}
                    />
                    <Stat
                        label="Longest"
                        value={formatDuration(stats.longest)}
                        hint={formatPreciseDuration(stats.longest)}
                    />
                    <Stat
                        label="Average"
                        value={formatDuration(stats.averageMs)}
                        hint={formatPreciseDuration(stats.averageMs)}
                    />
                    <Stat
                        label="First met"
                        value={formatDateTime(stats.firstMet)}
                        hint={`Last met ${formatDateTime(stats.lastMet)}`}
                    />
                </dl>
            </CardContent>
        </Card>
    );
}
