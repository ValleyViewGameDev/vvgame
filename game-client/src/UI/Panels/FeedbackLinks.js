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

/**
 * "Have Feedback?" with the Discord and email buttons. Shown on the Map panel
 * (ZoomedOut/MapPanel.js) and at the bottom of the Settings panel; keep the two in step by using this.
 */
export default function FeedbackLinks() {
  const strings = useStrings();
  return (
    <div className="feedback-links">
      <h2 style={{ textAlign: 'center' }}>{strings[96]}</h2>
      <div className="shared-buttons">
        <button className="btn-basic" onClick={() => window.open(DISCORD_INVITE, '_blank')}>
          Join Discord Server
        </button>
      </div>
      <EmailUsButton />
    </div>
  );
}
