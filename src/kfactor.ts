import { PlayerState, KFactorTable, KFactorFn } from "./types.js";

/**
 * Creates a helper function that resolves a K-factor based on a lookup table
 * of [minGames, kFactor] thresholds.
 * 
 * @param tiers An array of [minGames, kFactor] tuples.
 * @returns A function that accepts a PlayerState and returns the resolved K-factor.
 */
export function createKFactorTable(tiers: KFactorTable): KFactorFn {
  if (tiers.length === 0) {
    throw new Error("K-factor table must have at least one tier");
  }

  // Sort tiers descending by minGames threshold
  const sortedTiers = [...tiers].sort((a, b) => b[0] - a[0]);

  return (player: PlayerState): number => {
    if (player.gamesPlayed === undefined) {
      throw new Error("gamesPlayed is required when using a dynamic K-factor table");
    }
    for (const [minGames, k] of sortedTiers) {
      if (player.gamesPlayed >= minGames) {
        return k;
      }
    }
    // Default to the tier with the lowest minGames threshold if none match
    // (Usually this is the 0 threshold tier)
    return sortedTiers[sortedTiers.length - 1][1];
  };
}
