import { useEffect, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';

/**
 * Centred dialog over a dimmed backdrop, matching the confirmation dialogs the
 * launcher page already used. Closes on Escape and on backdrop click; `footer`
 * holds the action row so button placement stays consistent between dialogs.
 */
export function Modal({
    open,
    onClose,
    title,
    icon,
    description,
    footer,
    className,
    children
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    icon?: ReactNode;
    description?: ReactNode;
    footer?: ReactNode;
    className?: string;
    children?: ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={cn(
                    'bg-card w-full max-w-md space-y-4 rounded-xl border p-5 shadow-2xl',
                    className
                )}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    {icon}
                    <div className="min-w-0 flex-1">
                        <h3 className="text-foreground text-base font-semibold">{title}</h3>
                        {description ? (
                            <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
                        ) : null}
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close dialog">
                        <XIcon />
                    </Button>
                </div>

                {children}

                {footer ? (
                    <div className="flex items-center justify-end gap-2 border-t pt-3">{footer}</div>
                ) : null}
            </div>
        </div>
    );
}
