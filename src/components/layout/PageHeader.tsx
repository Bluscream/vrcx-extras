import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Outer wrapper every page uses, so padding, gap and scroll behaviour match.
 * Every page fills the pane — pages that scroll their whole body add
 * `overflow-y-auto`, pages with an internal virtualised list manage their own.
 */
export function PageShell({ className, children, ...props }: ComponentProps<'div'>) {
    return (
        <div
            className={cn('relative flex h-full flex-col gap-4 p-4 sm:p-6', className)}
            {...props}
        >
            {children}
        </div>
    );
}

/**
 * Title block shared by every page: icon, heading, one line of context, and a
 * right-aligned action area. `mono` renders the description as a file path.
 */
export function PageHeader({
    icon: Icon,
    title,
    description,
    mono = false,
    actions
}: {
    icon: LucideIcon;
    title: ReactNode;
    description?: ReactNode;
    mono?: boolean;
    actions?: ReactNode;
}) {
    return (
        <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
                    <Icon className="text-primary size-6 shrink-0" />
                    {title}
                </h1>
                {description ? (
                    <p
                        className={cn(
                            'text-muted-foreground mt-0.5 text-sm',
                            mono && 'max-w-2xl truncate font-mono'
                        )}
                        title={mono && typeof description === 'string' ? description : undefined}
                    >
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
    );
}
