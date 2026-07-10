import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
    createTaskDraft,
    type Attachment,
    type RecurrenceRule,
    type RecurrenceStrategy,
    type Task,
    type TaskDraft,
    type TaskDraftField,
    type TaskEnergyLevel,
    type TaskPriority,
    type TaskStatus,
    type TimeEstimate,
} from '@mindwtr/core';

type UseTaskItemEditStateOptions = {
    task: Task;
    resetAttachmentState: (attachments: Attachment[] | undefined) => void;
};

export type TaskItemEditState = {
    draft: TaskDraft;
    editTitle: string;
    setEditTitle: (value: string) => void;
    editDueDate: string;
    setEditDueDate: (value: string) => void;
    editStartTime: string;
    setEditStartTime: (value: string) => void;
    editRelativeStartOffset: Task['relativeStartOffset'];
    setEditRelativeStartOffset: (value: Task['relativeStartOffset']) => void;
    editProjectId: string;
    setEditProjectId: (value: string) => void;
    editSectionId: string;
    setEditSectionId: (value: string) => void;
    editAreaId: string;
    setEditAreaId: (value: string) => void;
    editStatus: TaskStatus;
    setEditStatus: (value: TaskStatus) => void;
    editFocusedToday: boolean;
    setEditFocusedToday: (value: boolean) => void;
    editContexts: string;
    setEditContexts: (value: string) => void;
    editTags: string;
    setEditTags: (value: string) => void;
    editDescription: string;
    setEditDescription: (value: string) => void;
    editLocation: string;
    setEditLocation: (value: string) => void;
    editRecurrence: RecurrenceRule | '';
    setEditRecurrence: (value: RecurrenceRule | '') => void;
    editRecurrenceStrategy: RecurrenceStrategy;
    setEditRecurrenceStrategy: (value: RecurrenceStrategy) => void;
    editRecurrenceRRule: string;
    setEditRecurrenceRRule: (value: string) => void;
    editShowFutureRecurrence: boolean;
    setEditShowFutureRecurrence: (value: boolean) => void;
    editTimeEstimate: TimeEstimate | '';
    setEditTimeEstimate: (value: TimeEstimate | '') => void;
    editTimeSpentMinutes: number | undefined;
    setEditTimeSpentMinutes: (value: number | undefined) => void;
    editPriority: TaskPriority | '';
    setEditPriority: (value: TaskPriority | '') => void;
    editEnergyLevel: TaskEnergyLevel | '';
    setEditEnergyLevel: (value: TaskEnergyLevel | '') => void;
    editAssignedTo: string;
    setEditAssignedTo: (value: string) => void;
    editReviewAt: string;
    setEditReviewAt: (value: string) => void;
    editRepeatReminderMinutes: number | undefined;
    setEditRepeatReminderMinutes: (value: number | undefined) => void;
    showDescriptionPreview: boolean;
    setShowDescriptionPreview: Dispatch<SetStateAction<boolean>>;
    resetEditState: () => void;
};

const hasPreviewableDescription = (task: Task) => Boolean(task.description?.trim());

/**
 * React adapter over the TaskDraft module: one draft object in state, one
 * generated setter per field. Initialization, reset, dirty-checking, and the
 * update patch all live in task-draft.ts — this hook only binds the draft to
 * React and preserves the flat editTitle/setEditTitle surface the editor
 * components consume.
 */
export function useTaskItemEditState({
    task,
    resetAttachmentState,
}: UseTaskItemEditStateOptions): TaskItemEditState {
    const [draft, setDraft] = useState<TaskDraft>(() => createTaskDraft(task));
    const [showDescriptionPreview, setShowDescriptionPreview] = useState(() => hasPreviewableDescription(task));

    const setField = useCallback(<K extends TaskDraftField>(field: K, value: TaskDraft[K]) => {
        setDraft((current) => (current[field] === value ? current : { ...current, [field]: value }));
    }, []);

    const setters = useMemo(() => ({
        setEditTitle: (value: string) => setField('title', value),
        setEditDueDate: (value: string) => setField('dueDate', value),
        setEditStartTime: (value: string) => setField('startTime', value),
        setEditRelativeStartOffset: (value: Task['relativeStartOffset']) => setField('relativeStartOffset', value),
        setEditProjectId: (value: string) => setField('projectId', value),
        setEditSectionId: (value: string) => setField('sectionId', value),
        setEditAreaId: (value: string) => setField('areaId', value),
        setEditStatus: (value: TaskStatus) => setField('status', value),
        setEditFocusedToday: (value: boolean) => setField('focusedToday', value),
        setEditContexts: (value: string) => setField('contexts', value),
        setEditTags: (value: string) => setField('tags', value),
        setEditDescription: (value: string) => setField('description', value),
        setEditLocation: (value: string) => setField('location', value),
        setEditRecurrence: (value: RecurrenceRule | '') => setField('recurrence', value),
        setEditRecurrenceStrategy: (value: RecurrenceStrategy) => setField('recurrenceStrategy', value),
        setEditRecurrenceRRule: (value: string) => setField('recurrenceRRule', value),
        setEditShowFutureRecurrence: (value: boolean) => setField('showFutureRecurrence', value),
        setEditTimeEstimate: (value: TimeEstimate | '') => setField('timeEstimate', value),
        setEditTimeSpentMinutes: (value: number | undefined) => setField('timeSpentMinutes', value),
        setEditPriority: (value: TaskPriority | '') => setField('priority', value),
        setEditEnergyLevel: (value: TaskEnergyLevel | '') => setField('energyLevel', value),
        setEditAssignedTo: (value: string) => setField('assignedTo', value),
        setEditReviewAt: (value: string) => setField('reviewAt', value),
        setEditRepeatReminderMinutes: (value: number | undefined) => setField('repeatReminderMinutes', value),
    }), [setField]);

    const resetEditState = useCallback(() => {
        setDraft(createTaskDraft(task));
        resetAttachmentState(task.attachments);
        setShowDescriptionPreview(hasPreviewableDescription(task));
    }, [resetAttachmentState, task]);

    return {
        draft,
        editTitle: draft.title,
        editDueDate: draft.dueDate,
        editStartTime: draft.startTime,
        editRelativeStartOffset: draft.relativeStartOffset,
        editProjectId: draft.projectId,
        editSectionId: draft.sectionId,
        editAreaId: draft.areaId,
        editStatus: draft.status,
        editFocusedToday: draft.focusedToday,
        editContexts: draft.contexts,
        editTags: draft.tags,
        editDescription: draft.description,
        editLocation: draft.location,
        editRecurrence: draft.recurrence,
        editRecurrenceStrategy: draft.recurrenceStrategy,
        editRecurrenceRRule: draft.recurrenceRRule,
        editShowFutureRecurrence: draft.showFutureRecurrence,
        editTimeEstimate: draft.timeEstimate,
        editTimeSpentMinutes: draft.timeSpentMinutes,
        editPriority: draft.priority,
        editEnergyLevel: draft.energyLevel,
        editAssignedTo: draft.assignedTo,
        editReviewAt: draft.reviewAt,
        editRepeatReminderMinutes: draft.repeatReminderMinutes,
        ...setters,
        showDescriptionPreview,
        setShowDescriptionPreview,
        resetEditState,
    };
}
