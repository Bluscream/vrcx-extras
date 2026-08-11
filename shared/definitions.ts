/**
 * Parsing for the definition CSVs published at Bluscream/vrchat-definitions.
 *
 * Three copies of a near-identical parser used to live in src/api/client.ts,
 * each indexing `parts[n]` without checking length. They are unified here so
 * the column mapping is stated once and every access is bounds-checked.
 */
import type { CmdLineDefinition, RegistryDefinition } from './api.ts';

/**
 * Placeholder for a VRChat user id inside a definition's key name.
 *
 * VRChat writes per-account registry keys such as
 * `COLOR_PALETTES_CURRENT_usr_<uuid>`. Documenting every account is
 * impossible, so a definition may write `COLOR_PALETTES_CURRENT_{userId}`
 * and match any of them.
 */
export const USER_ID_PLACEHOLDER = '{userId}';

const UUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * Placeholder tokens used in definition key names, and what each may match.
 *
 * The patterns are deliberately specific rather than catch-alls.
 * `COLOR_PALETTES_{userId}` and `COLOR_PALETTES_CURRENT_{userId}` both prefix
 * the same real key, so a permissive placeholder would let the shorter
 * template swallow the longer one's keys and show the wrong description.
 */
const PLACEHOLDER_PATTERNS = {
    '{userId}': `usr_${UUID_SOURCE}`,
    '{uuid}': UUID_SOURCE
} as const;

type PlaceholderToken = keyof typeof PLACEHOLDER_PATTERNS;

/** Splits a key name while keeping the placeholder tokens as separate parts. */
const PLACEHOLDER_SPLIT = /(\{userId\}|\{uuid\})/;

function isPlaceholderToken(value: string): value is PlaceholderToken {
    return value === '{userId}' || value === '{uuid}';
}

function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits one CSV line, honouring double-quoted fields.
 *
 * Definition descriptions contain commas ("Audio volume level (0.0-1.0)"), so
 * a plain split on "," mis-columns those rows.
 */
export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            // "" inside a quoted field is a literal quote.
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current.trim());
    return fields;
}

/** Reads column `index`, returning '' rather than undefined when absent. */
function column(fields: readonly string[], index: number): string {
    return fields[index] ?? '';
}

type CsvRowReader<T> = (fields: readonly string[]) => T | null;

/** Parses a definition CSV body into a keyName-indexed map. */
function parseCsv<T>(text: string, readRow: CsvRowReader<T>): T[] {
    const rows: T[] = [];
    const lines = text.split(/\r?\n/);
    // Row 0 is the header.
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (!line) {
            continue;
        }
        const fields = parseCsvLine(line);
        // KeyName, ValueType and Description are the required columns.
        if (fields.length < 3) {
            continue;
        }
        const row = readRow(fields);
        if (row) {
            rows.push(row);
        }
    }
    return rows;
}

function readRegistryRow(fields: readonly string[]): RegistryDefinition | null {
    const keyName = column(fields, 0);
    if (!keyName) {
        return null;
    }
    return {
        keyName,
        valueType: column(fields, 1),
        description: column(fields, 2),
        defaultValue: column(fields, 3),
        pattern: column(fields, 4)
    };
}

function readCmdLineRow(fields: readonly string[]): CmdLineDefinition | null {
    const keyName = column(fields, 0);
    if (!keyName) {
        return null;
    }
    return {
        keyName,
        valueType: column(fields, 1),
        // The CSV encodes newlines in descriptions as a literal backslash-n.
        description: column(fields, 2).replace(/\\n/g, '\n'),
        defaultValue: column(fields, 3),
        pattern: column(fields, 4)
    };
}

export function parseCmdLineDefinitions(text: string): Record<string, CmdLineDefinition> {
    const map: Record<string, CmdLineDefinition> = {};
    for (const row of parseCsv(text, readCmdLineRow)) {
        map[row.keyName] = row;
    }
    return map;
}

/** A definition whose key name contains placeholders, with its matcher compiled. */
interface TemplatedDefinition {
    definition: RegistryDefinition;
    matcher: RegExp;
    /** Tokens in capture-group order, so a match can be mapped back to values. */
    tokens: PlaceholderToken[];
    /** Literal characters in the template; longer means more specific. */
    literalLength: number;
}

/**
 * Registry definitions split into exact and templated lookups.
 *
 * Built once per fetch so resolving a key is a map hit plus, at most, a walk
 * of the handful of templated rows.
 */
export interface RegistryDefinitionIndex {
    exact: Record<string, RegistryDefinition>;
    templated: TemplatedDefinition[];
}

function compileTemplate(definition: RegistryDefinition): TemplatedDefinition | null {
    const parts = definition.keyName.split(PLACEHOLDER_SPLIT);
    if (parts.length < 2) {
        return null;
    }

    const tokens: PlaceholderToken[] = [];
    const seen = new Map<PlaceholderToken, number>();
    let source = '^';
    let literalLength = 0;

    for (const part of parts) {
        if (isPlaceholderToken(part)) {
            const previous = seen.get(part);
            if (previous !== undefined) {
                // A token repeated in one key (e.g. {userId}_..._{userId}) must
                // match the same value both times, so backreference it.
                source += `\\${previous}`;
                continue;
            }
            tokens.push(part);
            seen.set(part, tokens.length);
            source += `(${PLACEHOLDER_PATTERNS[part]})`;
        } else {
            literalLength += part.length;
            source += escapeRegExp(part);
        }
    }
    source += '$';

    return { definition, matcher: new RegExp(source), tokens, literalLength };
}

export function parseRegistryDefinitions(text: string): RegistryDefinitionIndex {
    const exact: Record<string, RegistryDefinition> = {};
    const templated: TemplatedDefinition[] = [];

    for (const row of parseCsv(text, readRegistryRow)) {
        const template = compileTemplate(row);
        if (template) {
            templated.push(template);
        } else {
            exact[row.keyName] = row;
        }
    }

    // Most literal characters first, so the most specific template wins when
    // several could match the same key.
    templated.sort((a, b) => b.literalLength - a.literalLength);

    return { exact, templated };
}

export interface ResolvedRegistryDefinition extends RegistryDefinition {
    /** The user id captured from a templated key, when one matched. */
    userId?: string;
}

/**
 * Finds the definition describing `key`.
 *
 * Exact rows win over templates, so a specifically documented per-user key can
 * still override the generic form. On a template hit the placeholder is
 * substituted throughout, giving the UI a description that names the actual
 * account rather than showing a raw `{userId}`.
 */
export function resolveRegistryDefinition(
    index: RegistryDefinitionIndex,
    key: string
): ResolvedRegistryDefinition | undefined {
    const direct = index.exact[key];
    if (direct) {
        return direct;
    }

    for (const { definition, matcher, tokens } of index.templated) {
        const match = matcher.exec(key);
        if (!match) {
            continue;
        }

        // Map each token back to the value it captured, then substitute
        // throughout so the UI shows the real id instead of "{userId}".
        const values = new Map<PlaceholderToken, string>();
        tokens.forEach((token, position) => {
            const captured = match[position + 1];
            if (captured !== undefined) {
                values.set(token, captured);
            }
        });

        const fill = (value: string): string => {
            let filled = value;
            for (const [token, captured] of values) {
                filled = filled.split(token).join(captured);
            }
            return filled;
        };

        const resolved: ResolvedRegistryDefinition = {
            ...definition,
            keyName: key,
            description: fill(definition.description),
            defaultValue: fill(definition.defaultValue)
        };
        const userId = values.get(USER_ID_PLACEHOLDER);
        if (userId !== undefined) {
            resolved.userId = userId;
        }
        return resolved;
    }

    return undefined;
}
