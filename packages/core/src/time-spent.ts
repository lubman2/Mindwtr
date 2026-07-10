/**
 * Helpers for the task `timeSpentMinutes` total (completed focus sessions +
 * manual edits). The total is a plain LWW field; there is deliberately no
 * per-session log (see discussions #802/#830).
 */

// Guard against nonsense values and overflow; ~69 days of continuous work.
export const TIME_SPENT_MAX_MINUTES = 100_000;

/**
 * Coerce a stored time-spent value to a positive whole number of minutes,
 * or undefined when absent/zero/invalid.
 */
export function normalizeTimeSpentMinutes(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const rounded = Math.round(value);
    if (rounded <= 0) return undefined;
    return Math.min(rounded, TIME_SPENT_MAX_MINUTES);
}

/**
 * Add minutes to an existing total (e.g. a completed focus session).
 * Returns undefined when the result is zero/invalid so the field stays absent.
 */
export function addTimeSpentMinutes(current: unknown, addMinutes: number): number | undefined {
    const base = normalizeTimeSpentMinutes(current) ?? 0;
    const add = normalizeTimeSpentMinutes(addMinutes) ?? 0;
    return normalizeTimeSpentMinutes(base + add);
}
