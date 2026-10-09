import React, { useState } from 'react';
import NPCsInGridManager from '../../GridState/GridStateNPCs';
import { useStrings } from '../../UI/StringsContext';
import { workerAutoWorks } from '../NPCs/NPCCitizenBehavior';
import './WorkerAutoWorkToggle.css';

/**
 * "Automatically work?" at the top of a worker's panel (Farm Hand, Rancher, Lumberjack,
 * Crafter). Checked: the worker does its job by itself in its working state; unchecked: it
 * stands by near home (NPCCitizenBehavior.workerAutoWorks). Default on, except the Crafter.
 * Saved on the NPC record (npc.autoWork) with the rest of its citizen state.
 */
export default function WorkerAutoWorkToggle({ npc, gridId }) {
  const strings = useStrings();
  const live = (gridId && npc && NPCsInGridManager.getNPCsInGrid(gridId)?.[npc.id || npc._id]) || npc;
  const [checked, setChecked] = useState(() => workerAutoWorks(live));
  if (!live || live.action !== 'worker') return null;

  const toggle = () => {
    const next = !checked;
    setChecked(next); // optimistic: the brain reads the live NPC on its next tick
    live.autoWork = next;
    NPCsInGridManager.updateNPC(gridId, live.id, { autoWork: next }).catch(() => {});
  };

  return (
    <label className="worker-autowork">
      <input type="checkbox" checked={checked} onChange={toggle} />
      <span>{strings[17516] || 'Automatically work?'}</span>
    </label>
  );
}
