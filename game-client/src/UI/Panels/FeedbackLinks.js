import React from 'react';
import { useStrings } from '../StringsContext';
import { DISCORD_INVITE } from '../../config';

const FEEDBACK_EMAIL = 'valleyviewgamedev@gmail.com';
// the always-on player survey (docs/launch-checklist.md): here, in the Mailbox, and the one-time
// nudge after a level-up from L5 (UI/Modals/SurveyPromptModal.js)
export const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf_uEa9lFdncQt6DPlZKIyoB1AMQMLmIoPFzwjqtf2K3n617g/viewform';

/** The "Take a short survey" button: opens the Google Form in a new tab. */
export function SurveyButton() {
  const strings = useStrings();
  return (
    <div className="shared-buttons">
      <button className="btn-basic btn-success" onClick={() => window.open(SURVEY_URL, '_blank', 'noopener')}>
        {strings[98003]}
      </button>
    </div>
  );
}

/** The "@ Email Us" button on its own (also at the top of How to Play). */
export function EmailUsButton() {
  const strings = useStrings();
  return (
    <div className="shared-buttons">
      <button className="btn-basic" onClick={() => { window.location.href = `mailto:${FEEDBACK_EMAIL}`; }}>
        {strings[97]}
      </button>
    </div>
  );
}

/** The "Join Discord Server" button on its own (How to Play, under Email Us). */
export function DiscordButton() {
  const strings = useStrings();
  return (
    <div className="shared-buttons">
      <button className="btn-basic" onClick={() => window.open(DISCORD_INVITE, '_blank')}>
        {strings[98001] || 'Join Discord Server'}
      </button>
    </div>
  );
}

/**
 * "Have Feedback?" with the survey, Discord and email buttons, at the bottom of the Settings panel and of the Mailbox.
 * How to Play shows the same two buttons at its top (EmailUsButton, DiscordButton).
 */
export default function FeedbackLinks() {
  const strings = useStrings();
  return (
    <div className="feedback-links">
      <h2 style={{ textAlign: 'center' }}>{strings[96]}</h2>
      <SurveyButton />
      <DiscordButton />
      <EmailUsButton />
    </div>
  );
}
