import { describe, expect, it } from 'vitest';
import type { Area, Project } from './types';
import {
    applyCapturedProject,
    buildCaptureTaskProps,
    filterCaptureAreas,
    filterCaptureProjects,
    hasExactCaptureAreaMatch,
    hasExactCaptureProjectMatch,
    resolveCaptureAreaQuery,
    resolveCaptureProjectQuery,
} from './capture';

const makeProject = (overrides: Partial<Project>): Project => ({
    id: 'project-1',
    title: 'Launch',
    color: '#3b82f6',
    order: 0,
    status: 'active',
    tagIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const parsedBase = { title: 'Write brief', props: {}, projectTitle: undefined, detectedDate: undefined, invalidDateCommands: undefined };

const makeArea = (overrides: Partial<Area>): Area => ({
    id: 'area-1',
    name: 'Work',
    color: '#3b82f6',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

describe('buildCaptureTaskProps', () => {
    it('defaults to an inbox capture with the parsed title', () => {
        const result = buildCaptureTaskProps({ parsed: parsedBase, rawInput: 'Write brief', projects: [] });
        expect(result).toMatchObject({ ok: true, title: 'Write brief', props: { status: 'inbox' } });
    });

    it('walks the title fallback chain and refuses an empty capture', () => {
        const noTitle = { ...parsedBase, title: '' };
        expect(buildCaptureTaskProps({ parsed: noTitle, rawInput: '  ', fallbackTitle: 'Screenshot', projects: [] }))
            .toMatchObject({ ok: true, title: 'Screenshot' });
        expect(buildCaptureTaskProps({ parsed: noTitle, rawInput: ' ', projects: [] }))
            .toEqual({ ok: false, reason: 'empty-title' });
    });

    it('reuses a selectable project matched by +Project title', () => {
        const active = makeProject({ id: 'p-active', title: 'Launch' });
        const result = buildCaptureTaskProps({
            parsed: { ...parsedBase, projectTitle: 'launch' },
            rawInput: 'Write brief +Launch',
            projects: [active],
        });
        expect(result).toMatchObject({ ok: true, props: { projectId: 'p-active' } });
        expect((result as { projectToCreate?: unknown }).projectToCreate).toBeUndefined();
    });

    it('requests a fresh project when the title matches only an archived project — the capture is never dropped', () => {
        const archived = makeProject({ id: 'p-archived', title: 'Launch', status: 'archived' });
        const result = buildCaptureTaskProps({
            parsed: { ...parsedBase, projectTitle: 'Launch' },
            rawInput: 'Write brief +Launch',
            projects: [archived],
        });
        expect(result).toMatchObject({
            ok: true,
            projectToCreate: { title: 'Launch' },
        });
        expect((result as { props: { projectId?: string } }).props.projectId).toBeUndefined();
    });

    it('drops a parsed projectId that is no longer assignable', () => {
        const archived = makeProject({ id: 'p-archived', status: 'archived' });
        const result = buildCaptureTaskProps({
            parsed: { ...parsedBase, props: { projectId: 'p-archived' } },
            rawInput: 'Write brief',
            projects: [archived],
            selectedAreaId: 'area-1',
        });
        expect(result).toMatchObject({ ok: true, props: { areaId: 'area-1' } });
        expect((result as { props: { projectId?: string } }).props.projectId).toBeUndefined();
    });

    it('keeps Container exclusivity: a project home clears the area fallback', () => {
        const active = makeProject({ id: 'p-active' });
        const withProject = buildCaptureTaskProps({
            parsed: { ...parsedBase, props: { projectId: 'p-active' } },
            rawInput: 'x',
            projects: [active],
            selectedAreaId: 'area-1',
        });
        expect(withProject).toMatchObject({ ok: true, props: { projectId: 'p-active', areaId: undefined } });

        const pendingCreate = buildCaptureTaskProps({
            parsed: { ...parsedBase, projectTitle: 'Brand new' },
            rawInput: 'x +Brand new',
            projects: [],
            selectedAreaId: 'area-1',
        });
        expect((pendingCreate as { props: { areaId?: string } }).props.areaId).toBeUndefined();
    });

    it('applies the detected natural-language date only when nothing explicit set one', () => {
        const detected = { date: '2026-08-01', matchedText: 'aug 1', titleWithoutDate: 'Pay rent' };
        const applied = buildCaptureTaskProps({
            parsed: { ...parsedBase, title: 'Pay rent aug 1', detectedDate: detected },
            rawInput: 'Pay rent aug 1',
            projects: [],
        });
        expect(applied).toMatchObject({ ok: true, title: 'Pay rent', props: { dueDate: '2026-08-01' } });

        const suppressed = buildCaptureTaskProps({
            parsed: { ...parsedBase, title: 'Pay rent aug 1', detectedDate: detected },
            rawInput: 'Pay rent aug 1',
            projects: [],
            suppressDetectedDate: true,
        });
        expect(suppressed).toMatchObject({ ok: true, title: 'Pay rent aug 1' });
        expect((suppressed as { props: { dueDate?: string } }).props.dueDate).toBeUndefined();
    });

    it('stars the capture and leaves the gating to the store', () => {
        const result = buildCaptureTaskProps({
            parsed: parsedBase,
            rawInput: 'x',
            projects: [],
            starNewTask: true,
        });
        expect(result).toMatchObject({ ok: true, props: { isFocusedToday: true } });
    });
});

describe('buildCaptureTaskProps project fallback', () => {
    it('falls back to the surface project when the parsed +Project is unassignable', () => {
        const archived = makeProject({ id: 'p-archived', status: 'archived' });
        const current = makeProject({ id: 'p-current', title: 'Current' });
        const result = buildCaptureTaskProps({
            parsed: { ...parsedBase, props: { projectId: 'p-archived' } },
            rawInput: 'x',
            projects: [archived, current],
            initialProps: { projectId: 'p-current' },
        });
        expect(result).toMatchObject({ ok: true, props: { projectId: 'p-current' } });
    });
});

describe('applyCapturedProject', () => {
    it('attaches the created project and clears the direct area', () => {
        expect(applyCapturedProject({ status: 'inbox', areaId: 'area-1' }, 'p-new'))
            .toEqual({ status: 'inbox', areaId: undefined, projectId: 'p-new' });
    });
});

describe('capture picker helpers', () => {
    it('filters assignable projects by selected area and query', () => {
        const visible = makeProject({ id: 'p-visible', title: 'Launch Plan', areaId: 'area-1' });
        const otherArea = makeProject({ id: 'p-other', title: 'Launch Ops', areaId: 'area-2' });
        const archived = makeProject({ id: 'p-archived', title: 'Launch Archive', areaId: 'area-1', status: 'archived' });
        expect(filterCaptureProjects([visible, otherArea, archived], { selectedAreaId: 'area-1', query: 'plan' }))
            .toEqual([visible]);
    });

    it('treats an archived exact project-title match as createable, not selected', () => {
        const archived = makeProject({ id: 'p-archived', title: 'Launch', status: 'archived' });
        expect(hasExactCaptureProjectMatch([archived], 'Launch')).toBe(false);
        expect(resolveCaptureProjectQuery([archived], 'Launch', 'area-1')).toMatchObject({
            kind: 'create',
            projectToCreate: { title: 'Launch', initialProps: { areaId: 'area-1' } },
        });
    });

    it('selects an assignable exact project-title match', () => {
        const project = makeProject({ id: 'p-active', title: 'Launch' });
        expect(hasExactCaptureProjectMatch([project], 'launch')).toBe(true);
        expect(resolveCaptureProjectQuery([project], 'launch')).toMatchObject({
            kind: 'select',
            project: { id: 'p-active' },
        });
    });

    it('filters live areas and treats deleted exact area-name matches as createable', () => {
        const live = makeArea({ id: 'area-live', name: 'Work' });
        const deleted = makeArea({ id: 'area-deleted', name: 'Archive', deletedAt: '2026-01-02T00:00:00.000Z' });
        expect(filterCaptureAreas([live, deleted], 'wor')).toEqual([live]);
        expect(hasExactCaptureAreaMatch([deleted], 'Archive')).toBe(false);
        expect(resolveCaptureAreaQuery([deleted], 'Archive')).toMatchObject({
            kind: 'create',
            areaToCreate: { name: 'Archive' },
        });
    });

    it('selects a live exact area-name match', () => {
        const area = makeArea({ id: 'area-live', name: 'Work' });
        expect(hasExactCaptureAreaMatch([area], 'work')).toBe(true);
        expect(resolveCaptureAreaQuery([area], 'work')).toMatchObject({
            kind: 'select',
            area: { id: 'area-live' },
        });
    });
});
