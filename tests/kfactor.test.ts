import { describe, test, expect } from "vitest";
import { createKFactorTable } from "../src/kfactor.js";

describe("createKFactorTable basic tests", () => {
  const tiers = [
    [0, 50],
    [10, 30],
    [50, 20],
    [100, 10],
  ] as Array<[number, number]>;

  test("resolves correct K-factor based on games played", () => {
    const kFactorFn = createKFactorTable(tiers);

    // Player with 0 games played => K = 50
    expect(kFactorFn({ rating: 1500, gamesPlayed: 0 })).toBe(50);

    // Player with 5 games played => K = 50
    expect(kFactorFn({ rating: 1500, gamesPlayed: 5 })).toBe(50);

    // Player with 10 games played => K = 30
    expect(kFactorFn({ rating: 1500, gamesPlayed: 10 })).toBe(30);

    // Player with 49 games played => K = 30
    expect(kFactorFn({ rating: 1500, gamesPlayed: 49 })).toBe(30);

    // Player with 50 games played => K = 20
    expect(kFactorFn({ rating: 1500, gamesPlayed: 50 })).toBe(20);

    // Player with 99 games played => K = 20
    expect(kFactorFn({ rating: 1500, gamesPlayed: 99 })).toBe(20);

    // Player with 100 games played => K = 10
    expect(kFactorFn({ rating: 1500, gamesPlayed: 100 })).toBe(10);

    // Player with 1000 games played => K = 10
    expect(kFactorFn({ rating: 1500, gamesPlayed: 1000 })).toBe(10);
  });

  test("handles unsorted tiers correctly", () => {
    const unsortedTiers = [
      [50, 20],
      [0, 50],
      [100, 10],
      [10, 30],
    ] as Array<[number, number]>;

    const kFactorFn = createKFactorTable(unsortedTiers);
    expect(kFactorFn({ rating: 1500, gamesPlayed: 5 })).toBe(50);
    expect(kFactorFn({ rating: 1500, gamesPlayed: 25 })).toBe(30);
    expect(kFactorFn({ rating: 1500, gamesPlayed: 75 })).toBe(20);
    expect(kFactorFn({ rating: 1500, gamesPlayed: 120 })).toBe(10);
  });

  test("throws error if tiers table is empty", () => {
    expect(() => createKFactorTable([])).toThrow();
  });
});
