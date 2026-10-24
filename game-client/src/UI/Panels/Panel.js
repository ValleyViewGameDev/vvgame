import React, { useEffect } from 'react';
import { usePanelContext } from './PanelContext'; // Import the context
import './Panel.css';
import CloseButton from '../Buttons/CloseButton';
import { useStrings } from '../StringsContext';

// Panels that fly in from the RIGHT edge on desktop (docs/ui-conventions.md). Phones keep every
// panel on the left: mobile.css overrides the class.
const RIGHT_PANELS = new Set(['HowToPanel', 'SeasonPanel', 'LeaderboardPanel', 'TownNewsPanel']);

// Panel titles are text only (owner 2026-10-24): a leading emoji in a title string ("📊 Leaders")
// is dropped here, so strings shared with buttons keep theirs
const LEADING_EMOJI = /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}][\u{FE0F}\u{200D}\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*\s*)+/u;
const stripLeadingEmoji = (t) => (typeof t === 'string' ? t.replace(LEADING_EMOJI, '') : t);

const Panel = ({ onClose, children, descriptionKey, panelName, titleKey, title, footer }) => {
  const strings = useStrings();
  const { activePanel, openPanel, closePanel } = usePanelContext();

  useEffect(() => {
    if (activePanel === panelName) {
      openPanel(panelName); // Set this panel as active
    }
  }, [activePanel, panelName, openPanel]);

  if (activePanel !== panelName) {
    return null; // Ensure only the active panel is displayed
  }

  return (
    <div className={`panel-container${RIGHT_PANELS.has(panelName) ? ' panel-container--right' : ''}`} data-panel-name={panelName}>
      {/* Fixed Header with Title and Close Button */}
      <div className="panel-header">
        <h2 className="panel-title">{stripLeadingEmoji(title || strings[titleKey] || "Panel")}</h2>
        <CloseButton onClick={() => { closePanel(); onClose(); }} />
      </div>

      {/* Scrollable Content Area */}
      <div className="panel-content">{children}</div>

      {/* Pinned footer (below the scroll): the Sell section of a placed thing's panel (SellSection.js) */}
      {footer && <div className="panel-footer">{footer}</div>}

      {/* Panel Description */}
      {/* only when the string has text: an empty or missing one draws no footer (and no divider) */}
      {descriptionKey && String(strings[descriptionKey] || '').trim() && (
        <div className="panel-description">
          <p className="text-hint">{strings[descriptionKey]}</p>
        </div>
      )}

    </div>
  );
};

export default Panel;