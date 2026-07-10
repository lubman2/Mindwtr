import { describe, expect, it } from 'vitest';
import { isBareFileReference } from './attachment-reference';

const dataDirPrefix = 'C:/Users/me/AppData/Roaming';

describe('isBareFileReference', () => {
    it('flags file attachments pointing outside the app data dir with no cloud copy', () => {
        expect(isBareFileReference(
            { kind: 'file', uri: 'D:\\docs\\report.pdf' },
            dataDirPrefix,
        )).toBe(true);
        expect(isBareFileReference(
            { kind: 'file', uri: 'file:///D:/docs/report.pdf' },
            dataDirPrefix,
        )).toBe(true);
    });

    it('treats managed copies, synced files, links, and remote uris as owned', () => {
        expect(isBareFileReference(
            { kind: 'file', uri: 'C:\\Users\\me\\AppData\\Roaming\\mindwtr\\attachments\\id.pdf' },
            dataDirPrefix,
        )).toBe(false);
        expect(isBareFileReference(
            { kind: 'file', uri: 'D:\\docs\\report.pdf', cloudKey: 'attachments/id.pdf' },
            dataDirPrefix,
        )).toBe(false);
        expect(isBareFileReference(
            { kind: 'link', uri: 'https://example.com' },
            dataDirPrefix,
        )).toBe(false);
        expect(isBareFileReference(
            { kind: 'file', uri: 'https://example.com/file.pdf' },
            dataDirPrefix,
        )).toBe(false);
    });

    it('defaults to owned while the data dir is still unknown', () => {
        expect(isBareFileReference({ kind: 'file', uri: 'D:\\docs\\report.pdf' }, null)).toBe(false);
    });
});
