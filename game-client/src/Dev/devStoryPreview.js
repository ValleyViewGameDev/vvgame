import React from 'react';
import { createRoot } from 'react-dom/client';
import StoryModal from '../UI/Modals/StoryModal';

/**
 * Dev only: open THE story modal on any screen, signed in or not, to look at a layout without
 * playing to it (no account is made, nothing is saved). In the console:
 *   __storyPreview()                                   the FTUE opening (Gertrude, figure layout)
 *   __storyPreview({ dialogKey, figureFile, npcFilename, speakerName })
 * OK or the corner X closes it.
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  window.__storyPreview = (opts = {}) => {
    const props = {
      dialogKey: 16019,
      npcFilename: 'npc-head-gertrude.svg',
      figureFile: 'npc-figure-gertrude.png',
      figureEffect: 'ghost',
      speakerName: 'Gertrude',
      relationshipType: 'FTUE',
      ...opts,
    };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = () => { root.unmount(); host.remove(); };
    root.render(<StoryModal isOpen onClose={close} {...props} />);
    return 'opened';
  };
}
