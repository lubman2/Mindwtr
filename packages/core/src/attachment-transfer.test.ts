import { describe, expect, it, vi } from 'vitest';
import type { AppData, Attachment, Project, Task } from './types';
import {
    collectAttachmentsById,
    normalizePendingRemoteDeletes,
    runAttachmentTransferLifecycle,
} from './attachment-transfer';

const makeAttachment = (overrides: Partial<Attachment>): Attachment => ({
    id: 'attachment-1',
    kind: 'file',
    title: 'Attachment',
    uri: '/local/file.txt',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeTask = (overrides: Partial<Task>): Task => ({
    id: 'task-1',
    title: 'Task',
    status: 'next',
    tags: [],
    contexts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeProject = (overrides: Partial<Project>): Project => ({
    id: 'project-1',
    title: 'Project',
    color: '#94a3b8',
    order: 0,
    status: 'active',
    tagIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeData = (overrides: Partial<AppData>): AppData => ({
    tasks: [],
    projects: [],
    sections: [],
    areas: [],
    settings: {},
    ...overrides,
});

describe('runAttachmentTransferLifecycle', () => {
    it('uploads local file attachments that do not yet have a cloud key', async () => {
        const attachment = makeAttachment({ localStatus: 'missing' });
        const onUpload = vi.fn(async (item: Attachment) => {
            item.cloudKey = 'attachments/attachment-1.txt';
            return true;
        });
        const didMutate = await runAttachmentTransferLifecycle({
            attachmentsById: new Map([[attachment.id, attachment]]),
            localFileExists: vi.fn(async () => true),
            onUpload,
            onUploadError: vi.fn(),
            onDownload: vi.fn(),
            onDownloadError: vi.fn(),
        });

        expect(didMutate).toBe(true);
        expect(attachment.localStatus).toBe('available');
        expect(attachment.cloudKey).toBe('attachments/attachment-1.txt');
        expect(onUpload).toHaveBeenCalledWith(attachment, '/local/file.txt');
    });

    it('downloads remote attachments when the local file is missing', async () => {
        const attachment = makeAttachment({ cloudKey: 'attachments/attachment-1.txt', localStatus: 'available' });
        const onDownload = vi.fn(async (item: Attachment) => {
            item.uri = '/local/downloaded.txt';
            item.localStatus = 'available';
            return true;
        });
        const didMutate = await runAttachmentTransferLifecycle({
            attachmentsById: new Map([[attachment.id, attachment]]),
            localFileExists: vi.fn(async () => false),
            onUpload: vi.fn(),
            onUploadError: vi.fn(),
            onDownload,
            onDownloadError: vi.fn(),
        });

        expect(didMutate).toBe(true);
        expect(onDownload).toHaveBeenCalledWith(attachment);
        expect(attachment.uri).toBe('/local/downloaded.txt');
    });

    it('is a no-op on the second aligned pass', async () => {
        const attachment = makeAttachment({ cloudKey: 'attachments/attachment-1.txt', localStatus: 'available' });
        const didMutate = await runAttachmentTransferLifecycle({
            attachmentsById: new Map([[attachment.id, attachment]]),
            localFileExists: vi.fn(async () => true),
            onUpload: vi.fn(),
            onUploadError: vi.fn(),
            onDownload: vi.fn(),
            onDownloadError: vi.fn(),
        });

        expect(didMutate).toBe(false);
    });

    it('routes transfer errors to the operation-specific error callbacks', async () => {
        const uploadAttachment = makeAttachment({ id: 'upload', uri: '/local/upload.txt' });
        const downloadAttachment = makeAttachment({ id: 'download', uri: '/local/missing.txt', cloudKey: 'attachments/download.txt' });
        const uploadError = new Error('upload failed');
        const downloadError = new Error('download failed');
        const onUploadError = vi.fn();
        const onDownloadError = vi.fn();

        const didMutate = await runAttachmentTransferLifecycle({
            attachmentsById: new Map([
                [uploadAttachment.id, uploadAttachment],
                [downloadAttachment.id, downloadAttachment],
            ]),
            localFileExists: vi.fn(async (path) => path === '/local/upload.txt'),
            onUpload: vi.fn(async () => { throw uploadError; }),
            onUploadError,
            onDownload: vi.fn(async () => { throw downloadError; }),
            onDownloadError,
        });

        expect(didMutate).toBe(true);
        expect(onUploadError).toHaveBeenCalledWith(uploadAttachment, uploadError);
        expect(onDownloadError).toHaveBeenCalledWith(downloadAttachment, downloadError);
    });

    it('skips deleted and non-file attachments', async () => {
        const deleted = makeAttachment({ id: 'deleted', deletedAt: '2026-01-02T00:00:00.000Z' });
        const link = makeAttachment({ id: 'link', kind: 'link', uri: 'https://example.test' });
        const localFileExists = vi.fn(async () => true);
        const didMutate = await runAttachmentTransferLifecycle({
            attachmentsById: new Map([[deleted.id, deleted], [link.id, link]]),
            localFileExists,
            onUpload: vi.fn(),
            onUploadError: vi.fn(),
            onDownload: vi.fn(),
            onDownloadError: vi.fn(),
        });

        expect(didMutate).toBe(false);
        expect(localFileExists).not.toHaveBeenCalled();
    });

    it('lets platform adapters resolve local URI paths', async () => {
        const attachment = makeAttachment({ uri: 'file:///tmp/upload.txt' });
        const localFileExists = vi.fn(async () => true);
        await runAttachmentTransferLifecycle({
            attachmentsById: new Map([[attachment.id, attachment]]),
            localFileExists,
            resolveLocalPath: (uri) => uri.replace('file://', ''),
            onUpload: vi.fn(async () => false),
            onUploadError: vi.fn(),
            onDownload: vi.fn(),
            onDownloadError: vi.fn(),
        });

        expect(localFileExists).toHaveBeenCalledWith('/tmp/upload.txt');
    });
});

describe('collectAttachmentsById', () => {
    it('collects live task and project attachments and skips deleted owners', () => {
        const taskAttachment = makeAttachment({ id: 'task-attachment' });
        const projectAttachment = makeAttachment({ id: 'project-attachment' });
        const deletedOwnerAttachment = makeAttachment({ id: 'deleted-owner-attachment' });
        const data = makeData({
            tasks: [
                makeTask({ id: 'task-live', attachments: [taskAttachment] }),
                makeTask({ id: 'task-deleted', deletedAt: '2026-01-02T00:00:00.000Z', attachments: [deletedOwnerAttachment] }),
            ],
            projects: [makeProject({ id: 'project-live', attachments: [projectAttachment] })],
        });

        expect([...collectAttachmentsById(data).keys()]).toEqual(['task-attachment', 'project-attachment']);
    });
});

describe('normalizePendingRemoteDeletes', () => {
    it('dedupes by cloud key and keeps the highest attempt count', () => {
        expect(normalizePendingRemoteDeletes([
            { cloudKey: ' attachments/a.txt ', attempts: 1, title: 'old' },
            { cloudKey: 'attachments/a.txt', attempts: 3, title: 'new' },
            { cloudKey: '', attempts: 9 },
        ])).toEqual([
            { cloudKey: 'attachments/a.txt', attempts: 3, title: 'new', lastErrorAt: undefined },
        ]);
    });
});
