/**
 * Tracks in-flight incremental saveTask promises so that flushPendingSave()
 * can await them. This module is intentionally kept small and dependency-free
 * to avoid circular imports between store.ts and store-tasks.ts.
 */

let saveTaskInFlight: Promise<void> | null = null;

export const getSaveTaskInFlight = (): Promise<void> | null => saveTaskInFlight;

export const trackSaveTaskInFlight = (promise: Promise<void>): void => {
    const tracked = promise.finally(() => {
        if (saveTaskInFlight === tracked) saveTaskInFlight = null;
    });
    saveTaskInFlight = tracked;
};
