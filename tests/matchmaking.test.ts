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
});
