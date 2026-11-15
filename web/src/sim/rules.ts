// Outcome rules that make the player's calls matter. Each one is a single, explainable number.

/**
 * Defenders hold angles. A defender standing still whose target is inside this cone
 * (radians either side of where it is facing) is already aimed and fires almost at once.
 * Attackers walking in still pay the normal reaction and turn time. An unsmoked angle is
 * therefore a duel the defender is favored to win; a smoked one cannot be seen at all.
 */
export const HOLD_CONE = 0.75;
export const HOLD_REACTION_TICKS = 1;

/** A molly burns its target region. Defenders hold their spot, so staying in it is lethal. */
export const MOLLY_FLIGHT_TICKS = 12;
export const MOLLY_TICKS = 140;
export const MOLLY_DAMAGE_PER_TICK = 2;

/** A dropped spike is picked up by the nearest living attacker who walks over it. */
export const PICKUP_RADIUS = 10;

export type Outcome = 'win' | 'loss';
