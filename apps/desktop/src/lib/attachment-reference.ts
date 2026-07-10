import { useEffect, useState } from 'react';
import type { Attachment } from '@mindwtr/core';
import { normalizeAttachmentPathForUrl } from './attachment-paths';
import { stripFileScheme } from './sync-service-utils';
import { isTauriRuntime } from './runtime';

type AttachmentRef = Pick<Attachment, 'kind' | 'uri' | 'cloudKey'>;

// A bare reference is a file attachment the app does not own: its path lies
// outside the app data dir and no synced copy (cloudKey) exists to restore it.
// Pure string comparison — never stats the disk, safe in render paths.
export function isBareFileReference(attachment: AttachmentRef, dataDirPrefix: string | null): boolean {
    if (attachment.kind !== 'file') return false;
    if (attachment.cloudKey) return false;
    if (!dataDirPrefix) return false;
    const uri = (attachment.uri || '').trim();
    if (!uri || /^https?:\/\//i.test(uri)) return false;
    const normalized = normalizeAttachmentPathForUrl(stripFileScheme(uri));
    return !normalized.startsWith(dataDirPrefix);
}

let cachedDataDirPrefix: string | null = null;
let dataDirPrefixPromise: Promise<string | null> | null = null;

async function loadDataDirPrefix(): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    if (cachedDataDirPrefix) return cachedDataDirPrefix;
    if (!dataDirPrefixPromise) {
        dataDirPrefixPromise = import('@tauri-apps/api/path')
            .then(async ({ dataDir }) => {
                const base = await dataDir();
                cachedDataDirPrefix = normalizeAttachmentPathForUrl(base);
                return cachedDataDirPrefix;
            })
            .catch(() => null);
    }
    return dataDirPrefixPromise;
}

// Resolves the app data dir once per session; until it resolves, every
// attachment counts as owned (paperclip) so icons never flicker.
export function useBareFileReferenceCheck(): (attachment: AttachmentRef) => boolean {
    const [prefix, setPrefix] = useState<string | null>(cachedDataDirPrefix);
    useEffect(() => {
        if (prefix) return;
        let cancelled = false;
        void loadDataDirPrefix().then((resolved) => {
            if (!cancelled && resolved) setPrefix(resolved);
        });
        return () => {
            cancelled = true;
        };
    }, [prefix]);
    return (attachment) => isBareFileReference(attachment, prefix);
}
