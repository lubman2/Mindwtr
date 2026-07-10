import {
    runAttachmentTransferLifecycle,
    type AttachmentTransferLifecycleOptions,
} from '@mindwtr/core';
import { createCooperativeYield, stripFileScheme } from './sync-service-utils';

export {
    collectAttachmentsById,
    normalizePendingRemoteDeletes,
    reportProgress,
    validateAttachmentHash,
} from '@mindwtr/core';

type BasicRemoteAttachmentSyncOptions = Omit<
    AttachmentTransferLifecycleOptions,
    'beforeEachAttachment' | 'resolveLocalPath'
>;

export async function syncBasicRemoteAttachments(options: BasicRemoteAttachmentSyncOptions): Promise<boolean> {
    const maybeYield = createCooperativeYield(4);
    return await runAttachmentTransferLifecycle({
        ...options,
        beforeEachAttachment: maybeYield,
        resolveLocalPath: stripFileScheme,
    });
}

export const getBaseSyncUrl = (fullUrl: string): string => {
    const trimmed = fullUrl.replace(/\/+$/, '');
    if (trimmed.toLowerCase().endsWith('.json')) {
        const lastSlash = trimmed.lastIndexOf('/');
        return lastSlash >= 0 ? trimmed.slice(0, lastSlash) : trimmed;
    }
    return trimmed;
};

export const getCloudBaseUrl = (fullUrl: string): string => {
    const trimmed = fullUrl.replace(/\/+$/, '');
    if (trimmed.toLowerCase().endsWith('/data')) {
        return trimmed.slice(0, -'/data'.length);
    }
    return trimmed;
};
