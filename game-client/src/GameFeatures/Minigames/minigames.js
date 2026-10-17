/**
 * Minigames an NPC offer can start instead of a trade (traders.json `minigame: "<id>"`, no
 * `requires`). The offer's button is a MinigameButton (UI/Buttons/MinigameButton.js); winning pays
 * the offer's reward through the ordinary trade path, losing runs `onLose`.
 *
 * Kinds: 'riddle' (RiddleMinigame.js: a question and three answers, one right). Owner's note
 * (2026-10-17): Prospero's riddle is a stub until the real puzzle is designed.
 */
export const MINIGAMES = {
  prosperoRiddle: {
    kind: 'riddle',
    titleKey: 2064, title: "Prospero's Riddle",
    questionKey: 2065, question: 'Full fathom five thy father lies; of his bones are coral made. What are those that were his eyes?',
    answers: [
      { key: 2066, text: 'Pearls', correct: true },
      { key: 2067, text: 'Rubies' },
      { key: 2068, text: 'Sea-glass' },
    ],
    winKey: 2069, win: 'Rightly answered. Prospero gives thee his Orb.',
    loseKey: 2086, lose: 'Wrong. Prospero calls up a tempest, and three dragons with it!',
    onLose: { spawn: 'Dragon', count: 3 },
  },
};

export const minigameLabelKey = 2087; // "Answer the riddle"
