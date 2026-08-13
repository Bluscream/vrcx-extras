import type { ReactNode } from 'react';
import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The inline error/success strip pages show above their content. Previously
 * every page hand-rolled this with slightly different padding, border and icon.
 */
export function StatusBanner({
    variant = 'error',
    children,
    className
}: {
    variant?: 'error' | 'success';
    children: ReactNode;
    className?: string;
}) {
    if (!children) return null;

    const Icon = variant === 'error' ? AlertCircleIcon : CheckCircle2Icon;

    return (
        <div
            role={variant === 'error' ? 'alert' : 'status'}
            className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-sm',
                variant === 'error'
                    ? 'border-destructive/50 bg-destructive/10 text-destructive'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                className
            )}
        >
            <Icon className="size-5 shrink-0" />
            <span className="min-w-0">{children}</span>
        </div>
    );
}
