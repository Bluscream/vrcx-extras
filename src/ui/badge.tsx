import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'group/badge focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] focus-visible:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3!',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground',
                secondary: 'bg-secondary text-secondary-foreground',
                destructive:
                    'bg-destructive/10 text-destructive dark:bg-destructive/20',
                outline: 'border-border text-foreground',
                ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50'
            }
        },
        defaultVariants: {
            variant: 'default'
        }
    }
);

function Badge({
    className,
    variant = 'default',
    ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
    return (
        <span
            data-slot="badge"
            data-variant={variant}
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
