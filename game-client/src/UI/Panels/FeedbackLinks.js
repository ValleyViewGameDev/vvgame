import React from 'react';
import { useStrings } from '../StringsContext';
import { DISCORD_INVITE } from '../../config';

const FEEDBACK_EMAIL = 'valleyviewgamedev@gmail.com';

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
 * "Have Feedback?" with the Discord and email buttons, at the bottom of the Settings panel.
 * How to Play shows the same two buttons at its top (EmailUsButton, DiscordButton).
 */
export default function FeedbackLinks() {
  const strings = useStrings();
  return (
    <div className="feedback-links">
      <h2 style={{ textAlign: 'center' }}>{strings[96]}</h2>
      <DiscordButton />
      <EmailUsButton />
    </div>
  );
}
