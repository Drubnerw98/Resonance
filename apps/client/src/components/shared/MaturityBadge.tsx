import type { ProfileMaturity } from "../../lib/profileMaturity.ts";

interface Props {
  maturity: ProfileMaturity;
}

/**
 * Small inline badge that surfaces whether the user's profile is still
 * forming. Hidden once the profile reaches the maturity threshold — the
 * indicator's job is to set expectations for early-state recs and nudge
 * users toward the feedback loop, not to be permanent UI furniture.
 */
export function MaturityBadge({ maturity }: Props) {
  if (maturity.isMature) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
      <span className="font-medium">{maturity.summary}</span>
      {maturity.suggestion && (
        <span className="text-amber-200/70">{maturity.suggestion}</span>
      )}
    </div>
  );
}
