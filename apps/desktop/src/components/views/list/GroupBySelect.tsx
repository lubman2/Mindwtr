import { ChevronDown } from 'lucide-react';
import { tFallback } from '@mindwtr/core';
import { cn } from '../../../lib/utils';
import { getGroupAxisLabel, type TaskGroupAxis } from './next-grouping';

type GroupBySelectProps<Axis extends TaskGroupAxis> = {
    value: Axis;
    axes: readonly Axis[];
    onChange: (value: Axis) => void;
    t: (key: string) => string;
    className?: string;
};

/** The labeled GROUP select shared by every list toolbar. */
export function GroupBySelect<Axis extends TaskGroupAxis>({
    value,
    axes,
    onChange,
    t,
    className,
}: GroupBySelectProps<Axis>) {
    const groupLabel = tFallback(t, 'list.groupBy', 'Group');
    return (
        <div className={cn(
            'relative flex h-9 min-w-[150px] items-center rounded-lg border border-border bg-card pl-2 text-xs transition-colors hover:bg-muted/70 focus-within:ring-2 focus-within:ring-primary/40',
            className,
        )}>
            <span className="mr-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {groupLabel}
            </span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value as Axis)}
                aria-label={groupLabel}
                className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-8 text-xs text-foreground focus:outline-none"
            >
                {axes.map((axis) => (
                    <option key={axis} value={axis}>{getGroupAxisLabel(axis, t)}</option>
                ))}
            </select>
            <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
        </div>
    );
}
