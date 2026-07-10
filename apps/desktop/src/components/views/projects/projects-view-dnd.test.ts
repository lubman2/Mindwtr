import { describe, expect, it } from 'vitest';
import { projectsViewCollisionDetection, resolveTaskSidebarDropTarget } from './projects-view-dnd';
import { getProjectAreaContainerId } from './project-area-dnd';

type Rect = { top: number; left: number; width: number; height: number; bottom: number; right: number };

const rect = (top: number, height: number): Rect => ({
    top,
    left: 0,
    width: 200,
    height,
    bottom: top + height,
    right: 200,
});

const buildContainer = (id: string, containerRect: Rect, data: Record<string, unknown>) => ({
    id,
    key: id,
    data: { current: data },
    disabled: false,
    node: { current: null },
    rect: { current: containerRect },
});

type Container = ReturnType<typeof buildContainer>;

const buildArgs = ({
    activeId,
    activeData,
    containers,
    pointer,
}: {
    activeId: string;
    activeData: Record<string, unknown>;
    containers: Container[];
    pointer: { x: number; y: number } | null;
}) => ({
    active: {
        id: activeId,
        data: { current: activeData },
        rect: { current: { initial: rect(0, 30), translated: rect(0, 30) } },
    },
    collisionRect: rect(0, 30),
    droppableRects: new Map(containers.map((container) => [container.id, container.rect.current])),
    droppableContainers: containers,
    pointerCoordinates: pointer,
});

describe('projectsViewCollisionDetection', () => {
    it('keeps project drags inside their own sidebar section', () => {
        const activeZone = buildContainer(
            getProjectAreaContainerId('active', 'a1'),
            rect(0, 100),
            { zone: 'projectArea', section: 'active', areaId: 'a1' },
        );
        const deferredZone = buildContainer(
            getProjectAreaContainerId('deferred', 'a1'),
            rect(0, 100),
            { zone: 'projectArea', section: 'deferred', areaId: 'a1' },
        );
        const args = buildArgs({
            activeId: 'p1',
            activeData: { type: 'project', section: 'deferred' },
            containers: [activeZone, deferredZone],
            pointer: { x: 100, y: 50 },
        });

        const collisions = projectsViewCollisionDetection(args as never);
        expect(collisions.map((collision) => String(collision.id))).toEqual([
            getProjectAreaContainerId('deferred', 'a1'),
        ]);
    });

    it('prefers sidebar project rows over the surrounding area zone for task drags', () => {
        const zone = buildContainer(
            getProjectAreaContainerId('active', 'a1'),
            rect(0, 300),
            { zone: 'projectArea', section: 'active', areaId: 'a1' },
        );
        const projectRow = buildContainer('proj-1', rect(10, 30), { type: 'project', section: 'active' });
        const args = buildArgs({
            activeId: 't1',
            activeData: { type: 'task', sortable: true },
            containers: [zone, projectRow],
            pointer: { x: 100, y: 25 },
        });

        const collisions = projectsViewCollisionDetection(args as never);
        expect(collisions.map((collision) => String(collision.id))).toEqual(['proj-1']);
    });

    it('never offers archived sidebar targets to task drags', () => {
        const archivedZone = buildContainer(
            getProjectAreaContainerId('archived', 'a1'),
            rect(0, 300),
            { zone: 'projectArea', section: 'archived', areaId: 'a1' },
        );
        const archivedRow = buildContainer('proj-arch', rect(10, 30), { type: 'project', section: 'archived' });
        const args = buildArgs({
            activeId: 't1',
            activeData: { type: 'task', sortable: true },
            containers: [archivedZone, archivedRow],
            pointer: { x: 100, y: 25 },
        });

        expect(projectsViewCollisionDetection(args as never)).toEqual([]);
    });

    it('excludes the task list as a target when the drag is not sortable', () => {
        const taskRow = buildContainer('t2', rect(10, 30), { type: 'task', sortable: false });
        const sectionZone = buildContainer('section:none', rect(0, 300), { zone: 'section' });
        const args = buildArgs({
            activeId: 't1',
            activeData: { type: 'task', sortable: false },
            containers: [taskRow, sectionZone],
            pointer: { x: 100, y: 25 },
        });

        expect(projectsViewCollisionDetection(args as never)).toEqual([]);
    });

    it('falls back to closest-center over workspace containers only for sortable task drags', () => {
        const taskRow = buildContainer('t2', rect(100, 30), { type: 'task', sortable: true });
        const projectRow = buildContainer('proj-1', rect(400, 30), { type: 'project', section: 'active' });
        const args = buildArgs({
            activeId: 't1',
            activeData: { type: 'task', sortable: true },
            containers: [taskRow, projectRow],
            pointer: null,
        });

        const collisions = projectsViewCollisionDetection(args as never);
        expect(collisions.map((collision) => String(collision.id))).toEqual(['t2']);
    });
});

describe('resolveTaskSidebarDropTarget', () => {
    it('resolves active and deferred project rows', () => {
        expect(resolveTaskSidebarDropTarget('proj-1', { type: 'project', section: 'active' }))
            .toEqual({ kind: 'project', projectId: 'proj-1' });
        expect(resolveTaskSidebarDropTarget('proj-2', { type: 'project', section: 'deferred' }))
            .toEqual({ kind: 'project', projectId: 'proj-2' });
    });

    it('resolves area zones to area targets', () => {
        expect(resolveTaskSidebarDropTarget(
            getProjectAreaContainerId('active', 'a1'),
            { zone: 'projectArea', section: 'active', areaId: 'a1' },
        )).toEqual({ kind: 'area', areaId: 'a1' });
    });

    it('rejects archived targets and workspace containers', () => {
        expect(resolveTaskSidebarDropTarget('proj-3', { type: 'project', section: 'archived' })).toBeNull();
        expect(resolveTaskSidebarDropTarget(
            getProjectAreaContainerId('archived', 'a1'),
            { zone: 'projectArea', section: 'archived', areaId: 'a1' },
        )).toBeNull();
        expect(resolveTaskSidebarDropTarget('section:none', { zone: 'section' })).toBeNull();
        expect(resolveTaskSidebarDropTarget('t2', { type: 'task', sortable: true })).toBeNull();
    });
});
