/**
 * A quest's `prereq`: the title of a quest that must be complete first, or several titles
 * separated by "; ", all of which must be complete (Constable Elbow's "meet Cassio" step follows his
 * Helena step AND Helena's Golden Key quest, since Cassio stands behind the Golden Key's doors).
 * Every place that decides whether a quest is offered asks here.
 */
export const prereqTitles = (quest) => String(quest?.prereq || '')
  .split(';').map((t) => t.trim()).filter(Boolean);

export const prereqsMet = (quest, player) => prereqTitles(quest)
  .every((title) => (player?.completedQuests || []).some((q) => q.questId === title));
