import {
  calculateElo,
  createKFactorTable,
  softReset,
  MatchmakingPool,
  MatchmakingEntry,
  EloConfig,
} from "../src/index.js";

// 1. Define custom player type extending the matchmaking entry
interface TelegramPlayer extends MatchmakingEntry {
  username: string;
  gamesPlayed: number;
}

// 2. Set up configurations
const kTableTiers = [
  [0, 50],
  [10, 30],
  [50, 20],
  [100, 10],
] as Array<[number, number]>;

const kFactorResolver = createKFactorTable(kTableTiers);

const eloConfig: EloConfig = {
  kFactor: kFactorResolver,
  divisor: 400,
  minRating: 1000,
  roundTo: "integer",
};

const seasonResetConfig = {
  floor: 1200,
  factor: 0.5,
};

// Initialize matchmaking pool
const pvpPool = new MatchmakingPool<TelegramPlayer>({
  initialWindow: 50,
  expandBy: 25,
  expandEveryMs: 5000, // 5 seconds
});

console.log("=== Telegram PvP Game Simulation ===\n");

// 3. Matchmaking Phase
console.log("--- Matchmaking ---");
const playerA: TelegramPlayer = {
  id: "tg_111",
  rating: 1500,
  gamesPlayed: 5,
  joinedAt: 0,
  username: "alex_pk",
};

const playerB: TelegramPlayer = {
  id: "tg_222",
  rating: 1580,
  gamesPlayed: 12,
  joinedAt: 0,
  username: "boris_slayer",
};

const playerC: TelegramPlayer = {
  id: "tg_333",
  rating: 1200,
  gamesPlayed: 110,
  joinedAt: 0,
  username: "const_champ",
};

pvpPool.add(playerA);
pvpPool.add(playerB);
pvpPool.add(playerC);

console.log(`Players in queue: ${pvpPool.size()}`);
console.log(`- ${playerA.username} (Rating: ${playerA.rating}, Games: ${playerA.gamesPlayed})`);
console.log(`- ${playerB.username} (Rating: ${playerB.rating}, Games: ${playerB.gamesPlayed})`);
console.log(`- ${playerC.username} (Rating: ${playerC.rating}, Games: ${playerC.gamesPlayed})`);

// Find match at now = 0 (immediately)
console.log("\nSearching for match for alex_pk at t = 0s...");
const matchAt0 = pvpPool.findMatch(playerA.id, 0);
console.log(`Match found: ${matchAt0 ? matchAt0.username : "None"}`);

// Find match at now = 5000 (5 seconds wait)
console.log("Searching for match for alex_pk at t = 5s...");
const matchAt5 = pvpPool.findMatch(playerA.id, 5000);
console.log(`Match found: ${matchAt5 ? matchAt5.username : "None"}`);

// Find match at now = 10000 (10 seconds wait)
console.log("Searching for match for alex_pk at t = 10s...");
const matchAt10 = pvpPool.findMatch(playerA.id, 10000);
console.log(`Match found: ${matchAt10 ? matchAt10.username : "None"}`);

if (matchAt10) {
  // If match is found, remove both from the pool
  pvpPool.remove(playerA.id);
  pvpPool.remove(matchAt10.id);
  console.log(`Dequeued alex_pk and ${matchAt10.username}. Remaining queue size: ${pvpPool.size()}`);

  // 4. Match Resolution Phase
  console.log("\n--- Match Outcome ---");
  console.log(`${playerA.username} plays against ${matchAt10.username}. outcome: alex_pk wins!`);

  const outcome = calculateElo({
    playerA: { rating: playerA.rating, gamesPlayed: playerA.gamesPlayed },
    playerB: { rating: matchAt10.rating, gamesPlayed: matchAt10.gamesPlayed },
    outcome: "A",
    config: eloConfig,
  });

  const newRatingA = outcome.playerA.rating;
  const newRatingB = outcome.playerB.rating;

  console.log(`Expected score for ${playerA.username}: ${(outcome.expectedScoreA * 100).toFixed(2)}%`);
  console.log(`Resolved K-factor for ${playerA.username}: ${kFactorResolver({ rating: playerA.rating, gamesPlayed: playerA.gamesPlayed })}`);
  console.log(`Resolved K-factor for ${matchAt10.username}: ${kFactorResolver({ rating: matchAt10.rating, gamesPlayed: matchAt10.gamesPlayed })}`);

  console.log(`${playerA.username} Rating: ${playerA.rating} -> ${newRatingA} (delta: ${outcome.playerA.delta})`);
  console.log(`${matchAt10.username} Rating: ${matchAt10.rating} -> ${newRatingB} (delta: ${outcome.playerB.delta})`);
}

// 5. Seasonal Reset Phase
console.log("\n--- Seasonal Soft Reset ---");
const oldHighRating = 1600;
const resetHighRating = softReset(oldHighRating, seasonResetConfig);
console.log(`Player with rating ${oldHighRating} resets to: ${resetHighRating}`);

const oldLowRating = 1100;
const resetLowRating = softReset(oldLowRating, seasonResetConfig);
console.log(`Player with rating ${oldLowRating} resets to: ${resetLowRating} (capped at floor: ${seasonResetConfig.floor})`);
