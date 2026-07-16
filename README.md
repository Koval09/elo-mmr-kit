# elo-mmr-kit

[![npm version](https://img.shields.io/npm/v/elo-mmr-kit.svg?style=flat-square)](https://www.npmjs.com/package/elo-mmr-kit)
[![CI](https://github.com/Koval09/elo-mmr-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Koval09/elo-mmr-kit/actions)

A zero-dependency, fully configurable Elo/MMR rating and matchmaking toolkit for games.
It contains no hardcoded values and is completely stateless — storage is entirely your responsibility.

## Installation

Requires Node.js 20 or higher.

```bash
npm install elo-mmr-kit
```

## Quick Start

```typescript
import { calculateElo } from "elo-mmr-kit";

const result = calculateElo({
  playerA: { rating: 1500, gamesPlayed: 5 },
  playerB: { rating: 1400, gamesPlayed: 12 },
  outcome: "A", // "A" | "B" | "draw"
  config: { kFactor: 32 }
});

console.log(result.playerA.rating); // 1512 (gained +12 rating)
console.log(result.playerA.delta);  // 12
```

## Configuration Reference

### `EloConfig` Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `kFactor` | `number` \| `Array<[number, number]>` \| `(p: PlayerState) => number` | **Required** | The K-factor value, a list of `[minGames, k]` threshold pairs, or a custom resolver function. |
| `divisor` | `number` | `400` | The scale divisor for probability curves (higher = slower difference scaling). |
| `minRating` | `number` | `0` | The rating floor. Calculated ratings will never drop below this floor. |
| `maxRating` | `number` | `undefined` | The optional rating ceiling. Calculated ratings will never exceed this ceiling. |
| `roundTo` | `"integer"` \| `"none"` | `"integer"` | Rounding method applied to ratings. `"integer"` uses standard rounding; `"none"` keeps floating decimals. |

### Helper Functions

*   `resolveKFactor(player: PlayerState, kFactor: number | KFactorTable | KFactorFn): number` — Resolves the K-factor value for a player based on their current rating/gamesPlayed state and configuration.

---

## Example: Telegram PvP game

Here is a realistic example demonstrating custom K-factor tiers, seasonal soft resets, and matchmaking pool expansion:

```typescript
import {
  calculateElo,
  createKFactorTable,
  softReset,
  MatchmakingPool,
  MatchmakingEntry
} from "elo-mmr-kit";

interface TelegramPlayer extends MatchmakingEntry {
  username: string;
  gamesPlayed: number;
}

// 1. Dynamic K-factors: [minGamesPlayed, kFactor]
const kFactorResolver = createKFactorTable([
  [0, 50],   // Placements / new players
  [10, 30],  // Casual players
  [50, 20],  // Experienced players
  [100, 10]  // Veterans
]);

// 2. Seasonal Soft Reset (floor: 1200, scale factor: 0.5)
const oldRating = 1600;
const resetRating = softReset(oldRating, { floor: 1200, factor: 0.5 });
console.log(resetRating); // 1400

// 3. Matchmaking Queue (initial window 50, expands by 25 every 5 seconds)
const queue = new MatchmakingPool<TelegramPlayer>({
  initialWindow: 50,
  expandBy: 25,
  expandEveryMs: 5000
});

// Add players who joined at t = 0ms
queue.add({ id: "1", rating: 1500, gamesPlayed: 5, joinedAt: 0, username: "alex" });
queue.add({ id: "2", rating: 1580, gamesPlayed: 12, joinedAt: 0, username: "boris" });

// At t = 0s, window is 50. Difference is 80, so they don't match
console.log(queue.findMatch("1", 0)); // null

// At t = 10s (10000ms), window expands to 50 + 2 * 25 = 100. They match!
const opponent = queue.findMatch("1", 10000);
console.log(opponent?.username); // "boris"

if (opponent) {
  queue.remove("1");
  queue.remove(opponent.id);

  // Update ratings after "alex" wins
  const result = calculateElo({
    playerA: { rating: 1500, gamesPlayed: 5 },
    playerB: { rating: opponent.rating, gamesPlayed: opponent.gamesPlayed },
    outcome: "A",
    config: { kFactor: kFactorResolver, minRating: 1000 }
  });
  
  console.log(result.playerA.rating); // 1531 (gained +31 rating)
}
```

> [!NOTE]
> **Matchmaking Asymmetry:** Matchmaking searches are directed and asymmetric. A player who has been waiting in the queue longer has a wider search window and can match with a newer player, while that newer player might not match with the older player yet. Always remove both players from the pool once a match is found from either player's perspective.

---

## FAQ

### Why zero dependencies?
To keep the toolkit extremely lightweight, secure, and fast. It compiles to tiny ESM and CommonJS bundles, running anywhere without bloating your `node_modules` — from edge environments (like Cloudflare Workers) to browsers and backend servers.

### Where do I store ratings?
Since all functions are pure and the matchmaking pool is an in-memory data structure, the library has no database connection or I/O operations. Persisting player ratings and queue states is entirely up to you. You can use PostgreSQL, Redis, MongoDB, Firebase, DynamoDB, or any storage engine of your choice.

## License

MIT
