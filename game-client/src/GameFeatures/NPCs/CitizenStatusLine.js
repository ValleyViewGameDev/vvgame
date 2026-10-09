import React, { useEffect, useState } from 'react';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { useStrings } from '../../UI/StringsContext';
import { getLocalizedString } from '../../Utils/stringLookup';
import { citizenStatusText, citizenCountdown } from './citizenStatus';
import './CitizenStatusLine.css';

/**
 * "<Name> is resting. 2m 10s" at the top of a Citizen's panel (NPC panel, Farm Hand panel),
 * like the Farm Animal panel's status line. Reads the LIVE NPC from the grid state every
 * second, since the panel's own copy is a snapshot from the click. Renders nothing for a
 * citizen without a state loop.
 */
export default function CitizenStatusLine({ npc, gridId }) {
  const strings = useStrings();
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!npc) return null;
  const live = (gridId && NPCsInGridManager.getNPCsInGrid(gridId)?.[npc.id || npc._id]) || npc;
  const text = citizenStatusText(live, strings, { inPanel: true });
  if (!text) return null;
  const clock = citizenCountdown(live);
  return (
    <p className="citizen-status-line">
      <strong>{getLocalizedString(live.type, strings)}</strong> {text}{clock ? ` ${clock}` : ''}
    </p>
  );
}
