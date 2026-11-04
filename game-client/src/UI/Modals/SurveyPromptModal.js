import React from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { SURVEY_URL } from '../Panels/FeedbackLinks';
import '../Buttons/SharedButtons.css';
import './SurveyPromptModal.css';

/**
 * SurveyPromptModal: the one-time nudge to the player survey (docs/launch-checklist.md), shown
 * when the first level-up modal at L5 or above is closed (App.js, survey_prompt_seen_at). The
 * survey stays reachable from the Mailbox and Settings (UI/Panels/FeedbackLinks.js), which the
 * copy says. Taking it opens the form in a new tab and closes this.
 */
export default function SurveyPromptModal({ onClose }) {
  const strings = useStrings();
  const take = () => { window.open(SURVEY_URL, '_blank', 'noopener'); onClose(); };
  return (
    <Modal size="small" className="survey-prompt-modal" onClose={onClose} title={strings[98004]}>
      <p className="survey-prompt-body">{strings[98005]}</p>
      <p className="survey-prompt-later">{strings[98006]}</p>
      <div className="shared-buttons survey-prompt-actions">
        <button className="btn-basic btn-neutral" onClick={onClose}>{strings[98007]}</button>
        <button className="btn-basic btn-success" onClick={take}>{strings[98003]}</button>
      </div>
    </Modal>
  );
}
