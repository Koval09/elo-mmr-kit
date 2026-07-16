import { describe, test, expect, beforeEach } from "vitest";
import { MatchmakingPool } from "../src/matchmaking.js";
import { MatchmakingEntry } from "../src/types.js";

interface CustomPlayer extends MatchmakingEntry {
  name: string;
}

describe("MatchmakingPool tests", () => {
  let pool: MatchmakingPool<CustomPlayer>;

  beforeEach(() => {
    pool = new MatchmakingPool<CustomPlayer>({
      initialWindow: 50,
      expandBy: 25,
      expandEveryMs: 5000,
      maxWindow: 200,
    });
  });

  test("size and clear work correctly", () => {
    expect(pool.size()).toBe(0);

    pool.add({ id: "1", rating: 1000, name: "Alice" });
    pool.add({ id: "2", rating: 1100, name: "Bob" });
    expect(pool.size()).toBe(2);

    pool.clear();
    expect(pool.size()).toBe(0);
  });

  test("remove works correctly", () => {
    pool.add({ id: "1", rating: 1000, name: "Alice" });
    expect(pool.size()).toBe(1);

    const removed = pool.remove("1");
    expect(removed).toBe(true);
    expect(pool.size()).toBe(0);

    const removedAgain = pool.remove("1");
    expect(removedAgain).toBe(false);
  });

  test("does not match player with themselves", () => {
    pool.add({ id: "1", rating: 1000, name: "Alice" });
    const match = pool.findMatch("1", 1000);
    expect(match).toBeNull();
  });

  test("returns null if no players are within the rating window", () => {
    pool.add({ id: "1", rating: 1000, joinedAt: 0, name: "Alice" });
    pool.add({ id: "2", rating: 1300, joinedAt: 0, name: "Bob" });

    // Distance is 300, window at now = 0 is 50.
    const match = pool.findMatch("1", 0);
    expect(match).toBeNull();
  });

  test("finds closest player by rating", () => {
    pool.add({ id: "A", rating: 1000, joinedAt: 0, name: "Alice" });
    pool.add({ id: "B", rating: 1040, joinedAt: 0, name: "Bob" }); // dist 40
    pool.add({ id: "C", rating: 980, joinedAt: 0, name: "Charlie" }); // dist 20

    // Both B and C are in initialWindow (50), but C is closer (20 vs 40)
    const match = pool.findMatch("A", 0);
    expect(match).not.toBeNull();
    expect(match?.id).toBe("C");
  });

  test("window expands over waiting time", () => {
    pool.add({ id: "A", rating: 1000, joinedAt: 1000, name: "Alice" });
    pool.add({ id: "B", rating: 1090, joinedAt: 1000, name: "Bob" }); // dist 90

    // At now = 1000: wait = 0. window = 50. B is out of window.
    expect(pool.findMatch("A", 1000)).toBeNull();

    // At now = 5000: wait = 4000. window = 50. B is out of window.
    expect(pool.findMatch("A", 5000)).toBeNull();

    // At now = 6000: wait = 5000. window = 50 + 25 = 75. B is out of window.
    expect(pool.findMatch("A", 6000)).toBeNull();

    // At now = 11000: wait = 10000. window = 50 + (10000/5000)*25 = 100. B is in window!
    const match = pool.findMatch("A", 11000);
    expect(match).not.toBeNull();
    expect(match?.id).toBe("B");
  });

  test("window expansion clamps at maxWindow", () => {
    pool.add({ id: "A", rating: 1000, joinedAt: 0, name: "Alice" });
    pool.add({ id: "B", rating: 1250, joinedAt: 0, name: "Bob" }); // dist 250

    // maxWindow is 200, so even after 100 seconds (window = 50 + 20 * 25 = 550 clamped to 200),
    // they should never match because dist (250) > maxWindow (200).
    const match = pool.findMatch("A", 100000);
    expect(match).toBeNull();
  });

  test("matchmaking is deterministic and resolves ties correctly", () => {
    // Player A searching
    pool.add({ id: "A", rating: 1000, joinedAt: 0, name: "Alice" });

    // Scenario 1: Same distance, tie-breaker on joinedAt (longest waiting)
    pool.add({ id: "B", rating: 1010, joinedAt: 100, name: "Bob" }); // wait time 900 at now=1000
    pool.add({ id: "C", rating: 990, joinedAt: 50, name: "Charlie" }); // wait time 950 at now=1000 (Charlie joined earlier)

    let match = pool.findMatch("A", 1000);
    expect(match?.id).toBe("C"); // C joined earlier than B

    // Clear pool and test alphabetical ID tie-breaker
    pool.clear();
    pool.add({ id: "A", rating: 1000, joinedAt: 0, name: "Alice" });
    pool.add({ id: "Z", rating: 1010, joinedAt: 50, name: "Zack" });
    pool.add({ id: "Y", rating: 1010, joinedAt: 50, name: "Yuri" });

    // Y and Z have same rating, same joinedAt. Yuri ("Y") comes before Zack ("Z") alphabetically.
    match = pool.findMatch("A", 1000);
    expect(match?.id).toBe("Y");
  });

  test("preserves class prototypes of added entries", () => {
    class CustomPlayerClass implements MatchmakingEntry {
      id: string;
      rating: number;
      name: string;
      joinedAt?: number;

      constructor(id: string, rating: number, name: string) {
        this.id = id;
        this.rating = rating;
        this.name = name;
      }

      greet() {
        return `Hello ${this.name}`;
      }
    }

    const classPool = new MatchmakingPool<CustomPlayerClass>({
      initialWindow: 50,
      expandBy: 25,
      expandEveryMs: 5000,
    });

    const player1 = new CustomPlayerClass("1", 1000, "Alice");
    const player2 = new CustomPlayerClass("2", 1020, "Bob");

    classPool.add(player1);
    classPool.add(player2);

    const match = classPool.findMatch("1", Date.now());
    expect(match).not.toBeNull();
    expect(match).toBe(player2); // should be exact same reference
    expect(match?.greet()).toBe("Hello Bob");
  });

  test("demonstrates and verifies matchmaking window asymmetry", () => {
    // Player A joins at t=0, rating=1000
    // Player B joins at t=5000, rating=1090 (difference = 90)
    pool.add({ id: "A", rating: 1000, joinedAt: 0, name: "Alice" });
    pool.add({ id: "B", rating: 1090, joinedAt: 5000, name: "Bob" });

    // At t=5000:
    // Player A has waited 5000ms. Window = 50 + (5000 / 5000) * 25 = 75. Difference (90) > 75. No match.
    // Player B has waited 0ms. Window = 50. Difference (90) > 50. No match.
    expect(pool.findMatch("A", 5000)).toBeNull();
    expect(pool.findMatch("B", 5000)).toBeNull();

    // At t=8000:
    // Player A has waited 8000ms. Window = 50 + (8000 / 5000) * 25 = 75. Difference (90) > 75. No match.
    // Player B has waited 3000ms. Window = 50. Difference (90) > 50. No match.
    expect(pool.findMatch("A", 8000)).toBeNull();
    expect(pool.findMatch("B", 8000)).toBeNull();

    // At t=10000:
    // Player A has waited 10000ms. Window = 50 + (10000 / 5000) * 25 = 100. Difference (90) <= 100. Matches with B!
    // Player B has waited 5000ms. Window = 50 + (5000 / 5000) * 25 = 75. Difference (90) > 75. No match! (Asymmetric)
    expect(pool.findMatch("A", 10000)).not.toBeNull();
    expect(pool.findMatch("A", 10000)?.id).toBe("B");
    expect(pool.findMatch("B", 10000)).toBeNull();
  });
});
