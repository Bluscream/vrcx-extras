import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Empty({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="empty"
            className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-12 text-center text-balance',
                className
            )}
            {...props}
        />
    );
}

function EmptyMedia({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="empty-media"
            className={cn(
                'bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5',
                className
            )}
            {...props}
        />
    );
}

function EmptyTitle({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="empty-title"
            className={cn('font-heading text-base font-medium', className)}
            {...props}
        />
    );
}

function EmptyDescription({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot="empty-description"
            className={cn(
                'text-muted-foreground max-w-sm text-sm/relaxed',
                className
            )}
            {...props}
        />
    );
}

export { Empty, EmptyMedia, EmptyTitle, EmptyDescription };
