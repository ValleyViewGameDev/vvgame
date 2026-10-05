import React from 'react';
import { useStrings } from '../StringsContext';
import { DISCORD_INVITE } from '../../config';

/**
 * "Have Feedback?" with the Discord and email buttons. Shown on the base panel (Home sheet
 * on phones) and at the bottom of the Settings panel; keep the two in step by using this.
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
      <div className="shared-buttons">
        <button className="btn-basic" onClick={() => { window.location.href = 'mailto:valleyviewgamedev@gmail.com'; }}>
          {strings[97]}
        </button>
      </div>
    </div>
  );
}
