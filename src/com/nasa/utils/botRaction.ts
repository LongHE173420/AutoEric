
export const REACTION_TYPES = ["WOW", "ANGRY", "BORED", "SMILE", "SAD", "FUNNY", "LIKE", "EMPATHETIC"];

export function getRandomReaction(): string {
    return REACTION_TYPES[Math.floor(Math.random() * REACTION_TYPES.length)];
}
