/**
 * RETIRED FROM PRODUCTION RUNTIME.
 *
 * Historical HumanBehaviorResolver mixed current-message heuristics, reply-shape
 * observations and PC behavior preferences into a second ExpressionPlan authority.
 * Canonical Plan / RoleTurnPolicy / HumanTurn now own current-turn semantics, while
 * the persisted Role -> Identity generationPrompt chain owns configurable expression.
 *
 * Kept only as an overlay-safe tombstone so existing installations replace the old
 * implementation without requiring a destructive filesystem step.
 */
export {};
