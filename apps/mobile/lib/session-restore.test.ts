import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_RESTORE_WINDOW_MS } from '@mindwtr/core';

const memoryStore = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async (key: string) => memoryStore.get(key) ?? null,
        setItem: async (key: string, value: string) => { memoryStore.set(key, value); },
        removeItem: async (key: string) => { memoryStore.delete(key); },
    },
}));

import { persistLastRoute, readRestorableRoute } from './session-restore';

describe('mobile session restore', () => {
    beforeEach(() => {
        memoryStore.clear();
    });

    it('round-trips a restorable route within the window', async () => {
        await persistLastRoute('/projects-screen', { projectId: 'project-1' });
        expect(await readRestorableRoute()).toEqual({
            pathname: '/projects-screen',
            params: { projectId: 'project-1' },
        });
    });

    it('drops params outside the project context and off the projects screen', async () => {
        await persistLastRoute('/projects-screen', { projectId: 'project-1', openToken: 'x' } as never);
        expect(await readRestorableRoute()).toEqual({
            pathname: '/projects-screen',
            params: { projectId: 'project-1' },
        });
        await persistLastRoute('/inbox', { projectId: 'project-1' });
        expect(await readRestorableRoute()).toEqual({ pathname: '/inbox' });
    });

    it('expires after the restore window', async () => {
        await persistLastRoute('/board');
        expect(await readRestorableRoute(Date.now() + SESSION_RESTORE_WINDOW_MS + 1000)).toBeNull();
    });

    it('keeps the previous snapshot when a transient route is persisted', async () => {
        await persistLastRoute('/contexts');
        await persistLastRoute('/capture-modal');
        expect(await readRestorableRoute()).toEqual({ pathname: '/contexts' });
        await persistLastRoute('/settings');
        expect(await readRestorableRoute()).toEqual({ pathname: '/contexts' });
    });

    it('restores saved search routes by prefix', async () => {
        await persistLastRoute('/saved-search/abc');
        expect(await readRestorableRoute()).toEqual({ pathname: '/saved-search/abc' });
    });

    it('ignores unknown routes and malformed payloads', async () => {
        memoryStore.set('mindwtr:session:lastRoute', JSON.stringify({ pathname: '/nope', at: Date.now() }));
        expect(await readRestorableRoute()).toBeNull();
        memoryStore.set('mindwtr:session:lastRoute', 'not json');
        expect(await readRestorableRoute()).toBeNull();
    });
});
