import { SoftResetOptions, SoftResetFn } from "./types.js";

/**
 * Performs a seasonal soft reset on a player's rating.
 * 
 * If a config object is provided, computes: floor + (rating - floor) * factor.
 * The resulting rating will never go below the specified floor.
 * 
 * Alternatively, a custom reset function can be passed.
 * 
 * @param rating The current rating of the player.
 * @param options A SoftResetOptions object containing floor and factor, or a custom reset function.
 * @returns The reset rating.
 */
export function softReset(
  rating: number,
  options: SoftResetOptions | SoftResetFn
): number {
  if (typeof options === "function") {
    return options(rating);
  }

  const { floor, factor } = options;
  const resetRating = floor + (rating - floor) * factor;
  return Math.max(floor, resetRating);
}
