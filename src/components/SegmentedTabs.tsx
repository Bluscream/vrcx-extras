import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface SegmentedTabOption<T extends string> {
    value: T;
    label: string;
    icon?: LucideIcon;
}

/**
 * Single-choice pill row. Settings uses it for its sections and Config for its
 * form/JSON view switch; both previously hand-rolled the active-state classes.
 */
export function SegmentedTabs<T extends string>({
    value,
    onChange,
    options,
    className
}: {
    value: T;
    onChange: (value: T) => void;
    options: ReadonlyArray<SegmentedTabOption<T>>;
    className?: string;
}) {
    return (
        <div
            role="tablist"
            className={cn('bg-muted flex items-center gap-1 rounded-lg border p-1 text-xs', className)}
        >
            {options.map(({ value: optionValue, label, icon: Icon }) => {
                const active = value === optionValue;
                return (
                    <button
                        key={optionValue}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(optionValue)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                            active
                                ? 'bg-background text-foreground shadow-xs'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {Icon ? <Icon className="size-3.5" /> : null}
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
