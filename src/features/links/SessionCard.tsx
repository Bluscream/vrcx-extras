import { CheckIcon, ClockIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';

import { buildLaunchUri, formatDateTime, formatDuration, formatTime } from '@/lib/format';
import type { AccessType, OverlappingSession } from '@/types';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Card, CardContent } from '@/ui/card';

const accessTypeStyles: Record<AccessType, string> = {
    Public: 'text-status-online border-status-online/40',
    'Friends+': 'text-status-joinme border-status-joinme/40',
    Friends: 'text-status-joinme border-status-joinme/40',
    Group: 'text-status-askme border-status-askme/40',
    Private: 'text-muted-foreground border-border'
};

export function SessionCard({
    session,
    isCopied,
    onCopy
}: {
    session: OverlappingSession;
    isCopied: boolean;
    onCopy: (session: OverlappingSession) => void;
}) {
    return (
        <Card size="sm" className="hover:ring-foreground/20 transition-shadow">
            <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className="font-heading truncate text-sm font-medium"
                            title={session.worldId}
                        >
                            {session.worldName ||
                                session.worldId ||
                                'Unknown world'}
                        </span>
                        <Badge
                            variant="outline"
                            className={
                                accessTypeStyles[session.accessType] ??
                                accessTypeStyles.Private
                            }
                        >
                            {session.accessType}
                        </Badge>
                        {session.instanceId ? (
                            <Badge variant="ghost" className="font-mono">
                                #{session.instanceId}
                            </Badge>
                        ) : null}
                    </div>

                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="text-foreground flex items-center gap-1 font-medium">
                            <ClockIcon className="size-3.5" />
                            {formatDuration(session.durationMs)}
                        </span>
                        <span aria-hidden>·</span>
                        <time dateTime={new Date(session.joinedAt).toISOString()}>
                            {formatDateTime(session.joinedAt)} –{' '}
                            {formatTime(session.leftAt)}
                        </time>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {session.participants.map((participant) => (
                            <Badge
                                key={participant.userId}
                                variant="secondary"
                                title={participant.userId}
                            >
                                {participant.displayName}
                            </Badge>
                        ))}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCopy(session)}
                    >
                        {isCopied ? (
                            <>
                                <CheckIcon className="text-status-online" />
                                Copied
                            </>
                        ) : (
                            <>
                                <CopyIcon />
                                Copy link
                            </>
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Launch instance in VRChat"
                        title="Launch instance in VRChat"
                        onClick={() => {
                            window.location.href = buildLaunchUri(
                                session.location
                            );
                        }}
                    >
                        <ExternalLinkIcon />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
