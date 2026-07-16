import { MatchmakingPoolConfig, MatchmakingEntry } from "./types.js";

/**
 * An in-memory matchmaking pool that is generic over the user's player type.
 * It allows adding, removing, and finding matches for players based on their rating
 * and a waiting window that expands over time.
 */
export class MatchmakingPool<T extends MatchmakingEntry = MatchmakingEntry> {
  private pool: Map<string, { entry: T; joinedAt: number }> = new Map();
  private initialWindow: number;
  private expandBy: number;
  private expandEveryMs: number;
  private maxWindow?: number;

  /**
   * Constructs a new MatchmakingPool.
   * 
   * @param config Configuration for the matchmaking pool window.
   */
  constructor(config: MatchmakingPoolConfig) {
    this.initialWindow = config.initialWindow;
    this.expandBy = config.expandBy;
    this.expandEveryMs = config.expandEveryMs;
    this.maxWindow = config.maxWindow;
  }

  /**
   * Adds a player to the matchmaking pool.
   * If joinedAt is not provided, it defaults to the current timestamp.
   * 
   * @param entry The matchmaking entry to add.
   */
  add(entry: T): void {
    const joinedAt = entry.joinedAt ?? Date.now();
    this.pool.set(entry.id, {
      entry,
      joinedAt,
    });
  }

  /**
   * Removes a player from the matchmaking pool.
   * 
   * @param id The ID of the player to remove.
   * @returns true if the player was found and removed, false otherwise.
   */
  remove(id: string): boolean {
    return this.pool.delete(id);
  }

  /**
   * Finds the best opponent for a player within their current rating window.
   * 
   * The rating window expands over time based on wait time.
   * The "best" opponent is defined as:
   * 1. The opponent with the smallest rating difference.
   * 2. (Tie-breaker) The opponent who has been waiting the longest (earliest joinedAt).
   * 3. (Tie-breaker) The opponent with the lexicographically smaller ID.
   * 
   * This query is deterministic given the same inputs and does not modify the pool.
   * 
   * @param id The ID of the player searching for a match.
   * @param now The current timestamp. Defaults to Date.now().
   * @returns The best opponent entry, or null if no opponent is within the window.
   */
  findMatch(id: string, now?: number): T | null {
    const wrapper = this.pool.get(id);
    if (!wrapper) {
      return null;
    }
    const player = wrapper.entry;

    const currentNow = now ?? Date.now();
    const waitTime = Math.max(0, currentNow - wrapper.joinedAt);

    // Calculate expanding search window
    let windowSize = this.initialWindow;
    if (this.expandEveryMs > 0) {
      windowSize += Math.floor(waitTime / this.expandEveryMs) * this.expandBy;
    }
    if (this.maxWindow != null && windowSize > this.maxWindow) {
      windowSize = this.maxWindow;
    }

    let bestOpponentWrapper: { entry: T; joinedAt: number } | null = null;
    let minDiff = Infinity;

    for (const candidateWrapper of this.pool.values()) {
      const candidate = candidateWrapper.entry;
      if (candidate.id === id) {
        continue;
      }

      const diff = Math.abs(candidate.rating - player.rating);
      if (diff <= windowSize) {
        if (diff < minDiff) {
          minDiff = diff;
          bestOpponentWrapper = candidateWrapper;
        } else if (diff === minDiff && bestOpponentWrapper) {
          // Tie-breaker 1: longest waiting time (earliest joinedAt)
          const candidateJoinedAt = candidateWrapper.joinedAt;
          const bestJoinedAt = bestOpponentWrapper.joinedAt;

          if (candidateJoinedAt < bestJoinedAt) {
            bestOpponentWrapper = candidateWrapper;
          } else if (candidateJoinedAt === bestJoinedAt) {
            // Tie-breaker 2: lexicographical order of id
            if (candidate.id < bestOpponentWrapper.entry.id) {
              bestOpponentWrapper = candidateWrapper;
            }
          }
        }
      }
    }

    return bestOpponentWrapper ? bestOpponentWrapper.entry : null;
  }

  /**
   * Returns the current size of the matchmaking pool.
   * 
   * @returns The number of players in the pool.
   */
  size(): number {
    return this.pool.size;
  }

  /**
   * Clears all players from the matchmaking pool.
   */
  clear(): void {
    this.pool.clear();
  }
}
