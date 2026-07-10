import { useCallback } from 'react';
import {
    taskDraftToUpdatePatch,
    type Attachment,
    type StoreActionResult,
    type Task,
    type TaskDraft,
    type TaskStatus,
} from '@mindwtr/core';

type UseTaskItemSubmitParams = {
    draft: TaskDraft;
    editAttachments: Attachment[] | undefined;
    editingTaskId: string | null;
    setEditingTaskId: (id: string | null) => void;
    setIsEditing: (value: boolean) => void;
    showToast: (message: string, tone?: 'info' | 'error' | 'success') => void;
    task: Task;
    updateTask: (id: string, patch: Partial<Task>) => Promise<StoreActionResult>;
};

type TaskItemSubmitOptions = {
    statusOverride?: TaskStatus;
};

export function useTaskItemSubmit({
    draft,
    editAttachments,
    editingTaskId,
    setEditingTaskId,
    setIsEditing,
    showToast,
    task,
    updateTask,
}: UseTaskItemSubmitParams) {
    return useCallback(async (event?: React.FormEvent, options?: TaskItemSubmitOptions) => {
        event?.preventDefault();
        const patch = taskDraftToUpdatePatch(draft, task, {
            statusOverride: options?.statusOverride,
            attachments: editAttachments,
        });
        if (!patch) return;

        const result = await updateTask(task.id, patch);
        if (!result.success) {
            showToast(result.error || 'Failed to update task', 'error');
            return result;
        }
        setIsEditing(false);
        if (editingTaskId === task.id) {
            setEditingTaskId(null);
        }
        return result;
    }, [
        draft,
        editAttachments,
        editingTaskId,
        setEditingTaskId,
        setIsEditing,
        showToast,
        task,
        updateTask,
    ]);
}
