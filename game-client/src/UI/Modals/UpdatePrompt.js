import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import { BUILD_CHANGED_EVENT } from '../../Utils/buildWatch';
import '../Buttons/SharedButtons.css';

/**
 * "The Game Has Updated" (ported from House, features/updatePrompt.js there): shown once per
 * session when Utils/buildWatch.js sees that a new version was deployed while this tab was open.
 * A soft nudge, dismissable (× or later): the player can finish what they are doing and refresh
 * on their own. Refresh reloads the page; the client build's file names are content-hashed and
 * index.html is served no-cache (render.yaml), so the reload fetches the new code.
 * One <UpdatePromptHost /> at the app root (index.js).
 */
export function UpdatePromptHost() {
  const strings = useStrings();
  const [open, setOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  // The tap answers at once (the spinner replaces the label and the button stops taking taps);
  // the reload starts after two frames so the spinner is painted first: a reload begun in the
  // same tick freezes the page with the old label still showing until the new page arrives
  const refresh = () => {
    if (reloading) return;
    setReloading(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.location.reload()));
  };
  useEffect(() => {
    const onChange = () => setOpen(true);
    window.addEventListener(BUILD_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(BUILD_CHANGED_EVENT, onChange);
  }, []);
  if (!open) return null;
  return (
    <Modal size="narrow" className="update-prompt-modal" onClose={() => setOpen(false)} title={strings[2056] || 'The Game Has Updated'}>
      <p className="modal-message">{strings[2057] || 'A new version of Secrets of Elsinore is available. Refresh to load the latest.'}</p>
      <div className="modal-buttons shared-buttons">
        <button
          className={`btn-basic btn-success btn-modal${reloading ? ' is-busy' : ''}`}
          onClick={refresh}
          aria-busy={reloading}
          aria-label={strings[2058] || 'Refresh'}
        >
          {reloading ? <span className="btn-spinner" /> : (strings[2058] || 'Refresh')}
        </button>
      </div>
    </Modal>
  );
}
