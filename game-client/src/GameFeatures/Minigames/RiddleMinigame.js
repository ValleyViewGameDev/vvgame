import React, { useMemo } from 'react';
import Modal from '../../UI/Modals/Modal';
import '../../UI/Buttons/SharedButtons.css';
import { useStrings } from '../../UI/StringsContext';

/**
 * A multiple-choice riddle (minigames.js kind 'riddle'): the question and one button per answer,
 * in a shuffled order. onAnswer(correct) closes it; the caller pays out or punishes.
 */
export default function RiddleMinigame({ game, onAnswer, onClose }) {
  const strings = useStrings();
  const t = (key, fallback) => strings[key] || fallback;
  const answers = useMemo(() => [...game.answers].sort(() => Math.random() - 0.5), [game]);

  return (
    <Modal onClose={onClose} title={t(game.titleKey, game.title)} size="small">
      <p className="modal-message">{t(game.questionKey, game.question)}</p>
      <div className="shared-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {answers.map((a) => (
          <button key={a.key} className="btn-basic btn-neutral" onClick={() => onAnswer(!!a.correct)}>
            {t(a.key, a.text)}
          </button>
        ))}
      </div>
    </Modal>
  );
}
