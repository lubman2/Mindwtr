import { useContext } from 'react';
import { getStatusColor, type TaskStatus } from '@mindwtr/core';
import { ThemeContext, type ThemeContextType } from '../contexts/theme-context';

export type StatusColorSet = { bg: string; text: string; border: string };
export type StatusPalette = Record<TaskStatus, StatusColorSet>;

type ResolvableTheme = Pick<ThemeContextType, 'isDark' | 'themePreset'>;

const TASK_STATUSES: TaskStatus[] = ['inbox', 'next', 'waiting', 'someday', 'reference', 'done', 'archived'];

const tone = (hex: string): StatusColorSet => ({ bg: `${hex}26`, text: hex, border: hex });

const buildPalette = (hues: Record<TaskStatus, string>): StatusPalette => {
    const palette = {} as StatusPalette;
    for (const status of TASK_STATUSES) palette[status] = tone(hues[status]);
    return palette;
};

// Core STATUS_COLORS are tuned for light backgrounds; keep them as the light palette.
const LIGHT_STATUS_COLORS: StatusPalette = TASK_STATUSES.reduce((palette, status) => {
    palette[status] = getStatusColor(status);
    return palette;
}, {} as StatusPalette);

const DARK_STATUS_COLORS = buildPalette({
    inbox: '#9CA3AF',
    next: '#60A5FA',
    waiting: '#FBBF24',
    someday: '#A78BFA',
    reference: '#38BDF8',
    done: '#4ADE80',
    archived: '#9CA3AF',
});

// Nord frost/aurora hues so badges sit inside the theme's own palette.
const NORD_STATUS_COLORS = buildPalette({
    inbox: '#81A1C1',
    next: '#88C0D0',
    waiting: '#EBCB8B',
    someday: '#B48EAD',
    reference: '#8FBCBB',
    done: '#A3BE8C',
    archived: '#81A1C1',
});

// Mirrors the desktop sepia --status-* values (earthy tones on cream).
const SEPIA_STATUS_COLORS = buildPalette({
    inbox: '#9C6F3C',
    next: '#509550',
    waiting: '#C38E22',
    someday: '#8C5EBA',
    reference: '#2E8CB8',
    done: '#725A5A',
    archived: '#9C6F3C',
});

const EINK_STATUS_COLORS = buildPalette({
    inbox: '#000000',
    next: '#000000',
    waiting: '#000000',
    someday: '#000000',
    reference: '#000000',
    done: '#000000',
    archived: '#000000',
});

export function resolveStatusColors(theme?: ResolvableTheme | null): StatusPalette {
    if (!theme) return LIGHT_STATUS_COLORS;
    switch (theme.themePreset) {
        case 'nord': return NORD_STATUS_COLORS;
        case 'sepia': return SEPIA_STATUS_COLORS;
        case 'eink': return EINK_STATUS_COLORS;
        case 'oled': return DARK_STATUS_COLORS;
        default: return theme.isDark ? DARK_STATUS_COLORS : LIGHT_STATUS_COLORS;
    }
}

export function useStatusColors(): StatusPalette {
    return resolveStatusColors(useContext(ThemeContext));
}
