import API_BASE from '../config';
import axios from 'axios';
import { gatherClientInfo } from '../Utils/pageviewBeacon';
import { getBrowserType, getOSType, getDiagnostics } from '../Utils/clientDiagnostics';
import { detectLanguage } from '../Utils/detectLanguage';

const FRONTIER_NAME = 'Valley View 1';

/**
 * Silent account (docs/onboarding-plan.md §4.2): a visitor with no session gets a profile when
 * they tap Begin (UI/Modals/BeginModal.js; a bare page load never creates one), with a generated
 * name, no password and the detected language, and lands in their own tutorial cave. The name is
 * asked for when they sign the Home Deed. Returns the player record, already stored in
 * localStorage and set as the x-player-id header.
 */
export async function createSilentAccount() {
  const frontierResponse = await axios.get(`${API_BASE}/api/frontiers-by-name`, { params: { name: FRONTIER_NAME } });
  const frontier = frontierResponse.data?.[0];
  if (!frontier) throw new Error('Frontier not found');
  const diagnostics = await getDiagnostics();
  const response = await axios.post(`${API_BASE}/api/register-new-player`, {
    silent: true,
    language: detectLanguage(),
    frontierId: frontier._id,
    browser: getBrowserType(),
    os: getOSType(),
    diagnostics,
    clientInfo: gatherClientInfo(),
  });
  const player = response.data?.player;
  if (!response.data?.success || !player) throw new Error('Silent registration failed');
  localStorage.setItem('player', JSON.stringify(player));
  localStorage.setItem('initialZoomLevel', 'close');
  axios.defaults.headers.common['x-player-id'] = String(player.playerId || player._id);
  return player;
}
