/**
 * Speech topics that are not an emoji (owner 2026-11-10). A topic is a string, compared as a string
 * (Conversation.js compareTopics) and drawn by Render/PixiRenderer/speechTopicArt.js.
 *
 * PLAYER_FACE: the local player's own picture. It was the player's old `icon` emoji, which a
 * player with an avatar no longer has (and whose fallback, the smiling face, was also the "blush"
 * feeling's glyph). The bubble draws the saved avatar's head for it, the default look's when the
 * player has made none.
 */
export const PLAYER_FACE = 'face:player';
