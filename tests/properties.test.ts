import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { calculateElo } from "../src/rating.js";
import { MatchmakingPool } from "../src/matchmaking.js";
import { EloConfig } from "../src/types.js";

describe("calculateElo property-based tests", () => {
  // 1) Winner delta + loser delta ≈ 0 (within rounding, when no limits are hit)
  test("winner delta + loser delta ≈ 0 (when same K-factor and not hitting limits)", () => {
    fc.assert(
      fc.property(
        fc.record({
          ratingA: fc.integer({ min: 1000, max: 2000 }),
          ratingB: fc.integer({ min: 1000, max: 2000 }),
          kFactor: fc.integer({ min: 10, max: 100 }),
          outcome: fc.constantFrom("A" as const, "B" as const, "draw" as const),
          roundTo: fc.constantFrom("integer" as const, "none" as const),
        }),
        ({ ratingA, ratingB, kFactor, outcome, roundTo }) => {
          const config: EloConfig = {
            kFactor,
            roundTo,
            minRating: -1000000, // Very low minRating so we never hit it
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

  // 2) Rating never goes below minRating and never goes above maxRating
  test("rating never goes below minRating and never goes above maxRating", () => {
    fc.assert(
      fc.property(
        fc.record({
          ratingA: fc.integer({ min: -500, max: 2500 }),
          ratingB: fc.integer({ min: -500, max: 2500 }),
          minRating: fc.integer({ min: -1000, max: 500 }),
          maxRating: fc.integer({ min: 1500, max: 3000 }),
          kFactor: fc.integer({ min: 10, max: 100 }),
          outcome: fc.constantFrom("A" as const, "B" as const, "draw" as const),
          roundTo: fc.constantFrom("integer" as const, "none" as const),
        }),
        ({ ratingA, ratingB, minRating, maxRating, kFactor, outcome, roundTo }) => {
          // Adjust starting ratings to be within the min/max limits
          const startA = Math.max(minRating, Math.min(ratingA, maxRating));
          const startB = Math.max(minRating, Math.min(ratingB, maxRating));

          const config: EloConfig = {
            kFactor,
            minRating,
            maxRating,
            roundTo,
          };

          const result = calculateElo({
            playerA: { rating: startA, gamesPlayed: 10 },
            playerB: { rating: startB, gamesPlayed: 10 },
            outcome,
            config,
          });

          expect(result.playerA.rating).toBeGreaterThanOrEqual(minRating);
          expect(result.playerA.rating).toBeLessThanOrEqual(maxRating);
          expect(result.playerB.rating).toBeGreaterThanOrEqual(minRating);
          expect(result.playerB.rating).toBeLessThanOrEqual(maxRating);
        }
      )
    );
  });

  // 3) The higher the rating of the winner, the smaller their rating gain
  test("higher-rated winner gains less (or equal) than lower-rated winner would", () => {
    fc.assert(
      fc.property(
        fc.record({
          ratingLow: fc.integer({ min: 1000, max: 1500 }),
          ratingHigh: fc.integer({ min: 1501, max: 2000 }),
          ratingOpponent: fc.integer({ min: 1000, max: 2000 }),
          kFactor: fc.integer({ min: 10, max: 100 }),
          roundTo: fc.constantFrom("integer" as const, "none" as const),
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
          expect(resultLow.playerA.delta).toBeGreaterThanOrEqual(resultHigh.playerA.delta);
        }
      )
    );
  });
});

describe("MatchmakingPool property-based tests", () => {
  // 4) findMatch properties:
  // - never returns the player themselves
  // - always returns an opponent within the current window
  // - verifies that B is the best candidate (rating difference, waiting time, ID alphabetical tie-breakers)
  // - if null is returned, no candidates were within the window
  
  const poolConfigArb = fc.record({
    initialWindow: fc.integer({ min: 10, max: 100 }),
    expandBy: fc.integer({ min: 0, max: 50 }),
    expandEveryMs: fc.integer({ min: 1000, max: 10000 }),
    maxWindow: fc.option(fc.integer({ min: 100, max: 500 }), { nil: undefined }),
  });

  const entriesArb = fc.uniqueArray(
    fc.record({
      id: fc.uuidV(4),
      rating: fc.integer({ min: 100, max: 3000 }),
      joinedAt: fc.integer({ min: 0, max: 10000 }),
    }),
    { selector: (entry) => entry.id, minLength: 2, maxLength: 20 }
  );

  test("findMatch guarantees correctness, window limits, and tie-breakers", () => {
    fc.assert(
      fc.property(
        poolConfigArb,
        entriesArb,
        fc.integer({ min: 10000, max: 20000 }), // current timestamp
        (config, entries, now) => {
          const pool = new MatchmakingPool(config);
          for (const entry of entries) {
            pool.add(entry);
          }

          // Pick the first player from the generated entries to search
          const searcher = entries[0];
          const testNow = Math.max(now, searcher.joinedAt);

          // Calculate searcher's search window size at testNow
          const waitTime = testNow - searcher.joinedAt;
          let expectedWindow = config.initialWindow;
          if (config.expandEveryMs > 0) {
            expectedWindow += Math.floor(waitTime / config.expandEveryMs) * config.expandBy;
          }
          if (config.maxWindow != null && expectedWindow > config.maxWindow) {
            expectedWindow = config.maxWindow;
          }

          const match = pool.findMatch(searcher.id, testNow);

          if (match !== null) {
            // A. Never returns the player themselves
            expect(match.id).not.toBe(searcher.id);

            // B. Returns an opponent within the current window
            const ratingDiff = Math.abs(match.rating - searcher.rating);
            expect(ratingDiff).toBeLessThanOrEqual(expectedWindow);

            // C. Validate that it's the absolute best candidate in the pool
            for (const other of entries) {
              if (other.id === searcher.id || other.id === match.id) {
                continue;
              }

              const otherDiff = Math.abs(other.rating - searcher.rating);
              if (otherDiff <= expectedWindow) {
                if (otherDiff < ratingDiff) {
                  // Closer candidate should have been picked
                  throw new Error(
                    `Found closer candidate ${other.id} (diff ${otherDiff}) than picked ${match.id} (diff ${ratingDiff})`
                  );
                } else if (otherDiff === ratingDiff) {
                  // If rating distance is identical, check tie breakers
                  const otherJoined = other.joinedAt ?? testNow;
                  const matchJoined = match.joinedAt ?? testNow;
                  if (otherJoined < matchJoined) {
                    throw new Error(
                      `Found earlier candidate ${other.id} (joinedAt ${otherJoined}) than picked ${match.id} (joinedAt ${matchJoined})`
                    );
                  } else if (otherJoined === matchJoined) {
                    if (other.id < match.id) {
                      throw new Error(
                        `Found lexicographically smaller ID candidate ${other.id} than picked ${match.id}`
                      );
                    }
                  }
                }
              }
            }
          } else {
            // D. If null, verify indeed no other player was within the search window
            for (const other of entries) {
              if (other.id === searcher.id) {
                continue;
              }
              const otherDiff = Math.abs(other.rating - searcher.rating);
              if (otherDiff <= expectedWindow) {
                throw new Error(
                  `No match was found, but player ${other.id} is within the window (diff ${otherDiff} <= window ${expectedWindow})`
                );
              }
            }
          }
        }
      )
    );
  });
});
