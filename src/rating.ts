import { CalculateEloInput, CalculateEloResult, PlayerState, KFactorTable, KFactorFn } from "./types.js";

/**
 * Resolves the K-factor for a player based on the config.
 * 
 * @param player The player state containing rating and gamesPlayed.
 * @param kFactor The K-factor configuration (number, lookup table, or custom function).
 * @returns The resolved K-factor as a number.
 */
export function resolveKFactor(
  player: PlayerState,
  kFactor: number | KFactorTable | KFactorFn
): number {
  if (typeof kFactor === "number") {
    return kFactor;
  }
  if (typeof kFactor === "function") {
    return kFactor(player);
  }
  if (Array.isArray(kFactor)) {
    // Sort descending by minGames to find the highest threshold the player has met
    const sorted = [...kFactor].sort((a, b) => b[0] - a[0]);
    for (const [minGames, k] of sorted) {
      if (player.gamesPlayed >= minGames) {
        return k;
      }
    }
    // Fallback to the first element's value if no thresholds are met
    if (kFactor.length > 0) {
      return kFactor[0][1];
    }
  }
  throw new Error("Invalid kFactor configuration");
}

/**
 * Calculates new Elo ratings for two players after a match outcome.
 * This function is pure and stateless.
 * 
 * @param input The match outcome and configuration details.
 * @returns The new ratings, rating changes, and the expected score of player A.
 */
export function calculateElo(input: CalculateEloInput): CalculateEloResult {
  const { playerA, playerB, outcome, config } = input;

  const divisor = config.divisor ?? 400;
  const minRating = config.minRating ?? 0;
  const maxRating = config.maxRating;
  const roundTo = config.roundTo ?? "integer";

  // Calculate expected scores
  const expectedScoreA = 1 / (1 + Math.pow(10, (playerB.rating - playerA.rating) / divisor));
  const expectedScoreB = 1 - expectedScoreA;

  // Map outcome to actual scores
  let scoreA = 0.5;
  let scoreB = 0.5;
  if (outcome === "A") {
    scoreA = 1;
    scoreB = 0;
  } else if (outcome === "B") {
    scoreA = 0;
    scoreB = 1;
  }

  // Resolve K-factors
  const kA = resolveKFactor(playerA, config.kFactor);
  const kB = resolveKFactor(playerB, config.kFactor);

  // Compute raw new ratings
  let rawNewA = playerA.rating + kA * (scoreA - expectedScoreA);
  let rawNewB = playerB.rating + kB * (scoreB - expectedScoreB);

  // Apply rounding
  if (roundTo === "integer") {
    rawNewA = Math.round(rawNewA);
    rawNewB = Math.round(rawNewB);
  }

  // Apply minRating floor
  if (rawNewA < minRating) rawNewA = minRating;
  if (rawNewB < minRating) rawNewB = minRating;

  // Apply maxRating ceiling if configured
  if (maxRating !== undefined) {
    if (rawNewA > maxRating) rawNewA = maxRating;
    if (rawNewB > maxRating) rawNewB = maxRating;
  }

  // Normalize -0 to +0
  if (rawNewA === 0) rawNewA = 0;
  if (rawNewB === 0) rawNewB = 0;

  let deltaA = rawNewA - playerA.rating;
  let deltaB = rawNewB - playerB.rating;

  if (deltaA === 0) deltaA = 0;
  if (deltaB === 0) deltaB = 0;

  return {
    playerA: {
      rating: rawNewA,
      delta: deltaA,
    },
    playerB: {
      rating: rawNewB,
      delta: deltaB,
    },
    expectedScoreA,
  };
}
