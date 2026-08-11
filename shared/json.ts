/**
 * Types for values that cross a JSON boundary — request bodies, the VRChat
 * config file, registry payloads and the definitions schema.
 *
 * These exist so those boundaries can be modelled without `any`. `any` disables
 * checking on everything it touches and silently propagates, which is how a
 * shape mismatch reaches runtime as "cannot convert undefined to object"
 * instead of failing at compile time. `JsonValue` keeps the value opaque but
 * checked: reading it requires narrowing first.
 */
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: unknown): value is JsonValue[] {
    return Array.isArray(value);
}

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
    return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

/** Narrows unknown parsed JSON to JsonValue, rejecting undefined/functions/symbols. */
export function isJsonValue(value: unknown): value is JsonValue {
    if (isJsonPrimitive(value)) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJsonValue);
    }
    if (isJsonObject(value)) {
        return Object.values(value).every(isJsonValue);
    }
    return false;
}

/**
 * Reduces a thrown value to a message.
 *
 * `catch` binds `unknown` under strict TypeScript, and the common workaround —
 * `catch (err: any)` then `err.message` — reintroduces the hole this module
 * exists to close. Every catch site funnels through here instead.
 */
export function toErrorMessage(error: unknown, fallback = 'Unknown error'): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (isJsonObject(error) && typeof error['message'] === 'string') {
        return error['message'];
    }
    return fallback;
}

/** Node attaches `code` to syscall errors; reading it needs a narrowing step. */
export function errorCode(error: unknown): string | undefined {
    if (error instanceof Error && 'code' in error) {
        const code = (error as Error & { code?: unknown }).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
