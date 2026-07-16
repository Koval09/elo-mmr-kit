import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { calculateElo } from "../src/rating.js";
import { EloConfig } from "../src/types.js";

describe("calculateElo basic tests", () => {
  const defaultConfig: EloConfig = {
    kFactor: 32,
    divisor: 400,
    minRating: 0,
    roundTo: "integer",
  };

  test("normal win/loss calculation", () => {
    const playerA = { rating: 1600, gamesPlayed: 10 };
    const playerB = { rating: 1400, gamesPlayed: 10 };

    const result = calculateElo({
      playerA,
      playerB,
      outcome: "A",
      config: defaultConfig,
    });

    // Expected score for A is 1 / (1 + 10^((1400-1600)/400)) = 1 / (1 + 10^-0.5) = 1 / (1 + 0.316227) = 0.7597
    // Player A wins: rating change is 32 * (1 - 0.7597) = 32 * 0.2403 = 7.69 => 8
    // Player B loses: expected score for B is 0.2403. Rating change is 32 * (0 - 0.2403) = -7.69 => -8
    expect(result.playerA.rating).toBe(1608);
    expect(result.playerA.delta).toBe(8);
    expect(result.playerB.rating).toBe(1392);
    expect(result.playerB.delta).toBe(-8);
    expect(result.expectedScoreA).toBeCloseTo(0.7597, 4);
  });

  test("draw outcome", () => {
    const playerA = { rating: 1500, gamesPlayed: 5 };
    const playerB = { rating: 1500, gamesPlayed: 5 };

    const result = calculateElo({
      playerA,
      playerB,
      outcome: "draw",
      config: defaultConfig,
    });

    // Expected score is 0.5 for both
    // Change is 32 * (0.5 - 0.5) = 0
    expect(result.playerA.rating).toBe(1500);
    expect(result.playerA.delta).toBe(0);
    expect(result.playerB.rating).toBe(1500);
    expect(result.playerB.delta).toBe(0);
  });

  test("rating of 0 handles correctly", () => {
    const playerA = { rating: 0, gamesPlayed: 0 };
    const playerB = { rating: 1000, gamesPlayed: 10 };

    const result = calculateElo({
      playerA,
      playerB,
      outcome: "B", // player A loses, but starts at 0
      config: defaultConfig, // minRating default 0
    });

    // Player A should stay at 0 and not go below minRating
    expect(result.playerA.rating).toBe(0);
    expect(result.playerA.delta).toBe(0);
  });

  test("huge rating difference", () => {
    const playerA = { rating: 3000, gamesPlayed: 100 };
    const playerB = { rating: 100, gamesPlayed: 5 };

    const result = calculateElo({
      playerA,
      playerB,
      outcome: "A", // Strong player wins
      config: defaultConfig,
    });

    // Strong player wins, expected score is extremely close to 1
    // Delta should round to 0
    expect(result.playerA.delta).toBe(0);
    expect(result.playerB.delta).toBe(0);
  });

  test("custom minRating and maxRating", () => {
    const customConfig: EloConfig = {
      kFactor: 32,
      minRating: 1000,
      maxRating: 2000,
    };

    // Test floor
    const resultFloor = calculateElo({
      playerA: { rating: 1001, gamesPlayed: 5 },
      playerB: { rating: 1500, gamesPlayed: 5 },
      outcome: "B",
      config: customConfig,
    });
    expect(resultFloor.playerA.rating).toBe(1000);
    expect(resultFloor.playerA.delta).toBe(-1);

    // Test ceiling
    const resultCeiling = calculateElo({
      playerA: { rating: 1999, gamesPlayed: 5 },
      playerB: { rating: 1500, gamesPlayed: 5 },
      outcome: "A",
      config: customConfig,
    });
    expect(resultCeiling.playerA.rating).toBe(2000);
    expect(resultCeiling.playerA.delta).toBe(1);
  });

  test("roundTo none", () => {
    const configNoRound: EloConfig = {
      kFactor: 32,
      roundTo: "none",
    };

    const result = calculateElo({
      playerA: { rating: 1600, gamesPlayed: 10 },
      playerB: { rating: 1400, gamesPlayed: 10 },
      outcome: "A",
      config: configNoRound,
    });

    // 1600 + 32 * (1 - 0.7597469) = 1600 + 7.688
    expect(result.playerA.rating).toBeCloseTo(1607.688, 3);
    expect(result.playerA.delta).toBeCloseTo(7.688, 3);
  });

  test("kFactor as custom function and table", () => {
    // custom function K
    const kFn = (p: { rating: number; gamesPlayed: number }) => (p.rating > 1500 ? 16 : 32);
    const resultFn = calculateElo({
      playerA: { rating: 1600, gamesPlayed: 10 },
      playerB: { rating: 1400, gamesPlayed: 10 },
      outcome: "A",
      config: { kFactor: kFn },
    });
    // For A, rating > 1500, so K = 16. expectedScoreA = 0.7597. Delta = 16 * (1 - 0.7597) = 3.84 => 4
    expect(resultFn.playerA.delta).toBe(4);

    // custom table K
    const kTable: Array<[number, number]> = [
      [0, 40],
      [10, 20],
    ];
    const resultTable = calculateElo({
      playerA: { rating: 1500, gamesPlayed: 5 }, // K = 40
      playerB: { rating: 1500, gamesPlayed: 15 }, // K = 20
      outcome: "A",
      config: { kFactor: kTable },
    });
    expect(resultTable.playerA.delta).toBe(20); // 40 * (1 - 0.5) = 20
    expect(resultTable.playerB.delta).toBe(-10); // 20 * (0 - 0.5) = -10
  });
});

describe("calculateElo property-based tests", () => {
  test("winner delta + loser delta ≈ 0 (when same K-factor and not hitting limits)", () => {
    fc.assert(
      fc.property(
        fc.record({
          ratingA: fc.integer({ min: 1000, max: 2000 }),
          ratingB: fc.integer({ min: 1000, max: 2000 }),
          kFactor: fc.integer({ min: 10, max: 100 }),
          outcome: fc.constantFrom("A", "B", "draw" as const),
          roundTo: fc.constantFrom("integer", "none" as const),
        }),
        ({ ratingA, ratingB, kFactor, outcome, roundTo }) => {
          const config: EloConfig = {
            kFactor,
            roundTo,
            minRating: 0, // Set minRating very low to avoid hitting floor
          };
          const result = calculateElo({
            playerA: { rating: ratingA, gamesPlayed: 10 },
            playerB: { rating: ratingB, gamesPlayed: 10 },
            outcome,
            config,
          });

          const sum = result.playerA.delta + result.playerB.delta;
          if (roundTo === "integer") {
            // Because of rounding, the sum can be at most 1 digit off (e.g. +8 and -7 due to roundTo)
            expect(Math.abs(sum)).toBeLessThanOrEqual(1);
          } else {
            // Without rounding, sum should be exactly 0
            expect(sum).toBeCloseTo(0, 10);
          }
        }
      )
    );
  });

  test("rating never below minRating", () => {
    fc.assert(
      fc.property(
        fc.record({
          ratingA: fc.integer({ min: 0, max: 1000 }),
          ratingB: fc.integer({ min: 0, max: 1000 }),
          minRating: fc.integer({ min: 0, max: 500 }),
          kFactor: fc.integer({ min: 10, max: 100 }),
          outcome: fc.constantFrom("A", "B", "draw" as const),
          roundTo: fc.constantFrom("integer", "none" as const),
        }),
        ({ ratingA, ratingB, minRating, kFactor, outcome, roundTo }) => {
          // Adjust starting ratings to be at least minRating
          const startA = Math.max(ratingA, minRating);
          const startB = Math.max(ratingB, minRating);

          const config: EloConfig = {
            kFactor,
            minRating,
            roundTo,
          };

          const result = calculateElo({
            playerA: { rating: startA, gamesPlayed: 10 },
            playerB: { rating: startB, gamesPlayed: 10 },
            outcome,
            config,
          });

          expect(result.playerA.rating).toBeGreaterThanOrEqual(minRating);
          expect(result.playerB.rating).toBeGreaterThanOrEqual(minRating);
        }
      )
    );
  });

  test("higher-rated winner gains less (or equal) than lower-rated winner would", () => {
    fc.assert(
      fc.property(
        fc.record({
          ratingLow: fc.integer({ min: 1000, max: 1500 }),
          ratingHigh: fc.integer({ min: 1501, max: 2000 }),
          ratingOpponent: fc.integer({ min: 1000, max: 2000 }),
          kFactor: fc.integer({ min: 10, max: 100 }),
          roundTo: fc.constantFrom("integer", "none" as const),
        }),
        ({ ratingLow, ratingHigh, ratingOpponent, kFactor, roundTo }) => {
          const config: EloConfig = {
            kFactor,
            roundTo,
          };

          // Case 1: lower rated player wins against opponent
          const resultLow = calculateElo({
            playerA: { rating: ratingLow, gamesPlayed: 10 },
            playerB: { rating: ratingOpponent, gamesPlayed: 10 },
            outcome: "A",
            config,
          });

          // Case 2: higher rated player wins against same opponent
          const resultHigh = calculateElo({
            playerA: { rating: ratingHigh, gamesPlayed: 10 },
            playerB: { rating: ratingOpponent, gamesPlayed: 10 },
            outcome: "A",
            config,
          });

          // The delta for the lower-rated player should be greater than or equal to the delta for the higher-rated player
          // (They expect to win less, so they gain more on win)
          expect(resultLow.playerA.delta).toBeGreaterThanOrEqual(resultHigh.playerA.delta);
        }
      )
    );
  });
});
