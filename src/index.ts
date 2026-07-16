/**
 * elo-mmr-kit: A zero-dependency, fully configurable Elo/MMR rating and matchmaking toolkit.
 */

export { calculateElo, resolveKFactor } from "./rating.js";
export { createKFactorTable } from "./kfactor.js";
export { softReset } from "./season.js";
export { MatchmakingPool } from "./matchmaking.js";

// Export types
export * from "./types.js";
