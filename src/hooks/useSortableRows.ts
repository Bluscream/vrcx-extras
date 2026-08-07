import { useCallback, useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<TKey extends string> {
    key: TKey;
    direction: SortDirection;
}

/** Comparable value extracted from a row for a given column. */
export type SortValue = string | number;

export type SortAccessors<TRow, TKey extends string> = Record<
    TKey,
    (row: TRow) => SortValue
>;

function compare(a: SortValue, b: SortValue) {
    if (typeof a === 'number' && typeof b === 'number') {
        return a - b;
    }
    return String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: 'base'
    });
}

/**
 * Sorts rows by a named column. Toggling the active column flips direction;
 * choosing a different column starts from that column's natural direction, so
 * clicking "Duration" gives longest-first rather than an unhelpful ascending
 * sort the user has to click twice to undo.
 */
export function useSortableRows<TRow, TKey extends string>(
    rows: TRow[],
    accessors: SortAccessors<TRow, TKey>,
    initial: SortState<TKey>,
    defaultDirections: Partial<Record<TKey, SortDirection>> = {}
) {
    const [sort, setSort] = useState<SortState<TKey>>(initial);

    const toggleSort = useCallback(
        (key: TKey) => {
            setSort((current) =>
                current.key === key
                    ? {
                          key,
                          direction:
                              current.direction === 'asc' ? 'desc' : 'asc'
                      }
                    : { key, direction: defaultDirections[key] ?? 'asc' }
            );
        },
        // Call sites pass a module-level constant, so this stays stable.
        [defaultDirections]
    );

    const sortedRows = useMemo(() => {
        const accessor = accessors[sort.key];
        const factor = sort.direction === 'asc' ? 1 : -1;
        return [...rows].sort(
            (a, b) => compare(accessor(a), accessor(b)) * factor
        );
    }, [rows, accessors, sort]);

    return { sortedRows, sort, toggleSort };
}
