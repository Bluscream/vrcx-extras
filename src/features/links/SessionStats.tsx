import { useMemo } from 'react';

import {
    formatDateTime,
    formatDuration,
    formatPreciseDuration
} from '@/lib/format';
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
    hint
}: {
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd
                className="font-heading truncate text-sm font-medium"
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
            <CardContent className="space-y-3">
                <div>
                    <p className="text-muted-foreground text-xs">
                        Total time spent together
                    </p>
                    <p className="font-heading text-2xl font-medium tabular-nums">
                        {formatPreciseDuration(stats.totalMs)}
                    </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
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
