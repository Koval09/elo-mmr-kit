export interface PlayerState {
  rating: number;
  gamesPlayed?: number;
}

export type KFactorFn = (player: PlayerState) => number;
export type KFactorTable = Array<[minGames: number, k: number]>;

export interface EloConfig {
  kFactor: number | KFactorTable | KFactorFn;
  divisor?: number; // default 400
  minRating?: number; // default 0, ratings never go below
  maxRating?: number; // optional ceiling
  roundTo?: "integer" | "none"; // default "integer"
}

export interface CalculateEloInput {
  playerA: PlayerState;
  playerB: PlayerState;
  outcome: "A" | "B" | "draw";
  config: EloConfig;
}

export interface PlayerResult {
  rating: number;
  delta: number;
}

export interface CalculateEloResult {
  playerA: PlayerResult;
  playerB: PlayerResult;
  expectedScoreA: number;
}

export interface SoftResetOptions {
  floor: number;
  factor: number;
}

export type SoftResetFn = (rating: number) => number;

export interface MatchmakingPoolConfig {
  initialWindow: number;
  expandBy: number;
  expandEveryMs: number;
  maxWindow?: number;
}

export interface MatchmakingEntry {
  id: string;
  rating: number;
  joinedAt?: number;
}
