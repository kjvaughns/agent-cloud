import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  POSITION_TONE_CLASS, positionLabel, positionTone, sortPositions, type Position,
} from "@/lib/team/positions";
import { cn } from "@/lib/utils";

/** "GA 80" in the colour its rung of the ladder earns. */
export function PositionPill({ name, pct, className }: { name: string; pct: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        POSITION_TONE_CLASS[positionTone(pct)],
        className,
      )}
    >
      {positionLabel(name, pct)}
    </span>
  );
}

const CLEAR = "__none__";

/**
 * The roster's position cell: what they hold, and — for whoever may change it —
 * the picker to move them.
 *
 * Three states, deliberately distinct. With no catalog at all the cell says so
 * once rather than offering an empty picker to every row; with a catalog and no
 * assignment it invites the placement; with an assignment it shows the pill and
 * lets it be changed.
 */
export function PositionCell({
  positionName, positionPct, agencyLevelId, positions, canAssign, pending, onAssign,
}: {
  positionName: string | null;
  positionPct: number | null;
  agencyLevelId: string | null;
  positions: Position[];
  canAssign: boolean;
  pending?: boolean;
  onAssign: (agencyLevelId: string | null) => void;
}) {
  const hasCatalog = positions.length > 0;

  if (!hasCatalog) {
    return (
      <span className="text-xs text-muted-foreground" title="Positions are defined in Settings ▸ Levels & Positions">
        —
      </span>
    );
  }

  if (!canAssign) {
    return positionName != null && positionPct != null
      ? <PositionPill name={positionName} pct={positionPct} />
      : <span className="text-xs text-muted-foreground">Unassigned</span>;
  }

  return (
    <Select
      value={agencyLevelId ?? CLEAR}
      disabled={pending}
      onValueChange={(v) => onAssign(v === CLEAR ? null : v)}
    >
      <SelectTrigger
        className={cn(
          "h-7 w-auto min-w-[7.5rem] gap-1.5 border-none bg-transparent px-1 py-0 shadow-none",
          "hover:bg-surface-2 focus:ring-0 focus:ring-offset-0",
        )}
        aria-label="Position"
      >
        {positionName != null && positionPct != null ? (
          <PositionPill name={positionName} pct={positionPct} />
        ) : (
          <span className="text-xs text-muted-foreground">Assign…</span>
        )}
      </SelectTrigger>
      <SelectContent>
        {sortPositions(positions).map((p) => (
          <SelectItem key={p.id} value={p.id}>{positionLabel(p.name, p.pct)}</SelectItem>
        ))}
        {/* Clearing puts them back in the pending queue, which is where an
            agent whose position was set by mistake needs to end up. */}
        <SelectItem value={CLEAR}>No position</SelectItem>
      </SelectContent>
    </Select>
  );
}
