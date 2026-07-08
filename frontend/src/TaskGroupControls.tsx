import { normalizeTaskGroupColor, normalizeTaskGroupName } from './taskGroups';

export function TaskGroupPill({
  groupName,
  groupColor,
  compact = false,
}: {
  readonly groupName: string;
  readonly groupColor: string;
  readonly compact?: boolean;
}) {
  const label = normalizeTaskGroupName(groupName);
  const color = normalizeTaskGroupColor(groupColor);
  return (
    <span
      aria-label={`업무묶음: ${label}`}
      data-group-name={label}
      data-group-color={color}
      className={'inline-flex shrink-0 items-center gap-1 rounded-sm border font-sans font-medium leading-none text-white shadow-sm ' + (compact ? 'px-1.5 py-1 text-xs' : 'px-2 py-1 text-xs')}
      style={{ backgroundColor: color, borderColor: color }}
    >
      <span aria-hidden className={compact ? 'size-1.5 rounded-full bg-white/85' : 'size-2 rounded-full bg-white/85'} />
      {label}
    </span>
  );
}
