import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsAboutPage } from './useSettingsAboutPage';
import { getSettingsLabelFallback } from './labels';

const runtimeMock = vi.hoisted(() => ({
    isTauriRuntime: vi.fn(() => true),
    getInstallSourceOrFallback: vi.fn<() => Promise<string>>(),
}));

const updateServiceMock = vi.hoisted(() => ({
    checkForUpdates: vi.fn(async () => ({ hasUpdate: false })),
}));

vi.mock('../../../lib/runtime', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../lib/runtime')>()),
    isTauriRuntime: runtimeMock.isTauriRuntime,
    getInstallSourceOrFallback: runtimeMock.getInstallSourceOrFallback,
}));

vi.mock('../../../lib/update-service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../lib/update-service')>()),
    checkForUpdates: updateServiceMock.checkForUpdates,
}));

vi.mock('@tauri-apps/api/app', () => ({
    getVersion: vi.fn(async () => '1.0.0'),
}));

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(async () => null),
}));

vi.mock('../../../lib/app-log', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../lib/app-log')>()),
    getLogPath: vi.fn(async () => ''),
}));

function Harness() {
    useSettingsAboutPage({ t: getSettingsLabelFallback('en') });
    return null;
}

describe('useSettingsAboutPage background update check', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    it('stays offline until install source detection identifies a quiet channel', async () => {
        // Slow detection resolving to scoop: before the fix the check fired
        // with the initial 'unknown' source while detection was in flight.
        let resolveSource: (value: string) => void = () => {};
        runtimeMock.getInstallSourceOrFallback.mockImplementation(
            () => new Promise<string>((resolve) => { resolveSource = resolve; }),
        );

        render(<Harness />);

        // Give the app-version effect time to settle so the badge check would
        // have been eligible to run if it ignored the unresolved source.
        await waitFor(() => expect(runtimeMock.getInstallSourceOrFallback).toHaveBeenCalled());
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(updateServiceMock.checkForUpdates).not.toHaveBeenCalled();

        resolveSource('scoop');
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(updateServiceMock.checkForUpdates).not.toHaveBeenCalled();
    });

    it('runs the background check once detection resolves a non-quiet channel', async () => {
        runtimeMock.getInstallSourceOrFallback.mockResolvedValue('winget');

        render(<Harness />);

        await waitFor(() => expect(updateServiceMock.checkForUpdates).toHaveBeenCalledTimes(1));
        expect(updateServiceMock.checkForUpdates).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ installSource: 'winget' }),
        );
    });
});
