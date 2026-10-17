import React from 'react';
import ResourceButton from './ResourceButton';
import { useStrings } from '../StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { minigameLabelKey } from '../../GameFeatures/Minigames/minigames';

/**
 * ResourceButton for an NPC offer that is won in a minigame rather than paid for
 * (traders.json `minigame`, GameFeatures/Minigames/minigames.js). Same card as a trade, with a
 * 🧩 line instead of a cost; a tap starts the minigame.
 */
export default function MinigameButton({ recipe, quantity, disabled, onStart, ...rest }) {
  const strings = useStrings();
  return (
    <ResourceButton
      resourceType={recipe.type}
      symbol={recipe.symbol}
      name={`${quantity} ${getLocalizedString(recipe.type, strings)}`}
      details={`🧩 ${strings[minigameLabelKey] || 'Answer the riddle'}`}
      disabled={disabled}
      onClick={() => { if (!disabled) onStart(recipe); }}
      className="minigame"
      resource={recipe}
      {...rest}
    />
  );
}
