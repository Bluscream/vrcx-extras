import { SearchIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/ui/input';

/**
 * Search-icon + text field used by every filterable table. Pages previously
 * each rebuilt this with their own icon offsets and heights.
 */
export function FilterInput({
    value,
    onChange,
    placeholder = 'Filter…',
    className,
    id
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    id?: string;
}) {
    return (
        <div className={cn('relative w-full sm:max-w-64', className)}>
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
                id={id}
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="pl-7.5 text-xs"
            />
            {value ? (
                <button
                    type="button"
                    aria-label="Clear filter"
                    onClick={() => onChange('')}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
                >
                    <XIcon className="size-3.5" />
                </button>
            ) : null}
        </div>
    );
}
