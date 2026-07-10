import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Task } from '@mindwtr/core';
import { cn } from '../../../lib/utils';
import type { TaskGroup } from './next-grouping';

type GroupedTaskSectionsProps = {
    groups: TaskGroup[];
    renderTask: (task: Task, group: TaskGroup) => ReactNode;
    /** When provided, group headers become collapse toggles. */
    onToggleGroup?: (groupId: string) => void;
    collapsedGroupIds?: Set<string>;
    getSectionDomId?: (group: TaskGroup, index: number) => string | undefined;
};

/**
 * The one grouped-list section renderer: header card with dot, title, and
 * count, then the group's tasks. Shared by every grouped list view so the
 * grouping presentation cannot drift per view.
 */
export function GroupedTaskSections({
    groups,
    renderTask,
    onToggleGroup,
    collapsedGroupIds,
    getSectionDomId,
}: GroupedTaskSectionsProps) {
    const collapsible = Boolean(onToggleGroup);
    return (
        <div className="space-y-2">
            {groups.map((group, groupIndex) => {
                const collapsed = collapsible && (collapsedGroupIds?.has(group.id) ?? false);
                const controlsId = collapsible ? getSectionDomId?.(group, groupIndex) : undefined;
                const groupTitle = (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                        {collapsible && (
                            collapsed ? (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            ) : (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )
                        )}
                        {group.dotColor && (
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.dotColor }} aria-hidden="true" />
                        )}
                        <span className="truncate">{group.title}</span>
                    </span>
                );
                return (
                    <div key={group.id} className="rounded-md border border-border/40 bg-card/30">
                        {collapsible ? (
                            <button
                                type="button"
                                onClick={() => onToggleGroup?.(group.id)}
                                aria-expanded={!collapsed}
                                aria-controls={controlsId}
                                className={cn(
                                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-muted/30',
                                    'focus:outline-none focus:ring-2 focus:ring-primary/30',
                                    !collapsed && 'border-b border-border/30',
                                    group.muted ? 'text-muted-foreground' : 'text-foreground/90',
                                )}
                            >
                                {groupTitle}
                                <span className="shrink-0 text-muted-foreground">{group.tasks.length}</span>
                            </button>
                        ) : (
                            <div className={cn(
                                'flex items-center justify-between gap-3 border-b border-border/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide',
                                group.muted ? 'text-muted-foreground' : 'text-foreground/90',
                            )}>
                                {groupTitle}
                                <span className="shrink-0 text-muted-foreground">{group.tasks.length}</span>
                            </div>
                        )}
                        {!collapsed && (
                            <div id={controlsId} className="divide-y divide-border/30">
                                {group.tasks.map((task) => renderTask(task, group))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
