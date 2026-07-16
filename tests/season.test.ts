import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { softReset } from "../src/season.js";

describe("softReset basic tests", () => {
  test("rating above floor is correctly scaled", () => {
    const rating = 1600;
    const options = { floor: 1200, factor: 0.5 };
    // 1200 + (1600 - 1200) * 0.5 = 1200 + 200 = 1400
    expect(softReset(rating, options)).toBe(1400);
  });

  test("rating never goes below floor", () => {
    const rating = 1100;
    const options = { floor: 1200, factor: 0.5 };
    // 1200 + (1100 - 1200) * 0.5 = 1150 => capped at 1200
    expect(softReset(rating, options)).toBe(1200);
  });

  test("works correctly when rating is already below floor", () => {
    const rating = 900;
    const options = { floor: 1000, factor: 0.8 };
    // 1000 + (900 - 1000) * 0.8 = 920 => capped at 1000
    expect(softReset(rating, options)).toBe(1000);
  });

  test("works with a custom function", () => {
    const rating = 1500;
    const customFn = (r: number) => r - 100;
    expect(softReset(rating, customFn)).toBe(1400);
  });

  test("throws error if factor is outside [0, 1]", () => {
    expect(() => softReset(1500, { floor: 1000, factor: -0.1 })).toThrow(/factor/);
    expect(() => softReset(1500, { floor: 1000, factor: 1.1 })).toThrow(/factor/);
  });
});

describe("softReset property-based tests", () => {
  test("never crosses the floor", () => {
    fc.assert(
      fc.property(
        fc.record({
          rating: fc.integer({ min: -10000, max: 10000 }),
          floor: fc.integer({ min: -5000, max: 5000 }),
          factor: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        ({ rating, floor, factor }) => {
          const resetRating = softReset(rating, { floor, factor });
          expect(resetRating).toBeGreaterThanOrEqual(floor);
        }
      )
    );
  });

  test("if rating <= floor, softReset always returns floor", () => {
    fc.assert(
      fc.property(
        fc.record({
          floor: fc.integer({ min: -5000, max: 5000 }),
          factor: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        ({ floor, factor }) => {
          fc.assert(
            fc.property(
              fc.integer({ min: -10000, max: floor }),
              (rating) => {
                const resetRating = softReset(rating, { floor, factor });
                expect(resetRating).toBe(floor);
              }
            )
          );
        }
      )
    );
  });

  test("softReset is idempotent at the floor", () => {
    fc.assert(
      fc.property(
        fc.record({
          rating: fc.integer({ min: -10000, max: 10000 }),
          floor: fc.integer({ min: -5000, max: 5000 }),
          factor: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        ({ rating, floor, factor }) => {
          const options = { floor, factor };
          const firstReset = softReset(rating, options);
          const secondReset = softReset(firstReset, options);

          // If we are at the floor, it's strictly idempotent
          if (firstReset === floor) {
            expect(secondReset).toBe(floor);
          }
          // In all cases, the second reset will never cross the floor either
          expect(secondReset).toBeGreaterThanOrEqual(floor);
        }
      )
    );
  });
});
