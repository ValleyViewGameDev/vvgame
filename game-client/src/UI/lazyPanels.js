/**
 * The game's panels and in-game modals, split out of the main bundle (2026-11-16).
 *
 * A brand-new visitor sees only the login scene and the Begin modal, so none of this code is
 * needed for the first screen; it used to be part of the one 925 KB main.js the scene waited
 * for. Each panel is now its own chunk, fetched by `prefetchPanels()`:
 *   - a signed-in player: at the very start of App's init (alongside the tuning), so every panel
 *     is in memory long before the board fades in and no panel ever opens late;
 *   - a new visitor: once the live login scene has faded in (LoginScene.js), so the panels do not
 *     compete with the scene's sprite sheets; Begin reloads the page and finds them cached.
 * Should a panel still be opened before its chunk arrives, only that panel waits (each one has its
 * own Suspense, fallback nothing); the rest of the screen is untouched.
 *
 * Stylesheets stay in the main CSS: an async chunk's CSS is appended after mobile.css and would
 * beat the phone overrides, so App.js imports `./lazyPanelStyles`, which lists every stylesheet in
 * its old cascade position (no .chunk.css in the build; check it when adding a panel here).
 *
 * To add a panel: one `lazyPanel(() => import(...))` line below, and its stylesheets (and those of
 * anything only it imports) in lazyPanelStyles.js. A module that is also imported statically
 * somewhere else in the main bundle gains nothing here (Store, FarmAnimals, LanguagePickerModal,
 * HopeFound, LoginPanel stay static on purpose).
 */
import React, { Suspense, forwardRef, lazy } from 'react';

const loaders = [];

function lazyPanel(load) {
  let promise = null;
  const once = () => (promise ||= load().catch((err) => { promise = null; throw err; }));
  loaders.push(once);
  const Lazy = lazy(once);
  const Panel = forwardRef((props, ref) => (
    <Suspense fallback={null}>
      <Lazy ref={ref} {...props} />
    </Suspense>
  ));
  return Panel;
}

let prefetched = false;
/** Fetch every panel chunk now (idempotent). A failed chunk is retried when the panel opens. */
export function prefetchPanels() {
  if (prefetched) return;
  prefetched = true;
  loaders.forEach((load) => load().catch(() => {}));
}

export const ProfilePanel = lazyPanel(() => import('../Authentication/ProfilePanel'));
export const DebugPanel = lazyPanel(() => import('../Utils/debug'));
export const InventoryPanel = lazyPanel(() => import('../GameFeatures/Inventory/InventoryPanel'));
export const WarehousePanel = lazyPanel(() => import('../GameFeatures/Inventory/WarehousePanel'));
export const TrophyPanel = lazyPanel(() => import('../GameFeatures/Trophies/TrophyPanel.js'));
export const HowToPanel = lazyPanel(() => import('./Panels/HowToPanel'));
export const HowToMoneyPanel = lazyPanel(() => import('./Panels/HowToMoneyPanel'));
export const HowToGemsPanel = lazyPanel(() => import('./Panels/HowToGemsPanel'));
export const QuestPanel = lazyPanel(() => import('../GameFeatures/Quests/QuestPanel'));
export const NPCPanel = lazyPanel(() => import('../GameFeatures/NPCs/NPCsPanel.js'));
export const BuildPanel = lazyPanel(() => import('../GameFeatures/Build/BuildPanel'));
export const BuyPanel = lazyPanel(() => import('../GameFeatures/Buy/BuyPanel'));
export const PetsPanel = lazyPanel(() => import('../GameFeatures/Pets/PetsPanel'));
export const BuyDecoPanel = lazyPanel(() => import('../GameFeatures/Deco/BuyDecoPanel'));
export const FarmingPanel = lazyPanel(() => import('../GameFeatures/Farming/FarmingPanel'));
export const ToolsPanel = lazyPanel(() => import('../GameFeatures/Farming/ToolsPanel'));
export const SkillsPanel = lazyPanel(() => import('../GameFeatures/Skills/SkillsPanel'));
export const GovPanel = lazyPanel(() => import('../GameFeatures/Government/GovPanel'));
export const LeaderboardPanel = lazyPanel(() => import('../GameFeatures/Leaderboard/Leaderboard'));
export const BankPanel = lazyPanel(() => import('../GameFeatures/Trading/Bank'));
export const InnPanel = lazyPanel(() => import('../GameFeatures/Inn/InnPanel'));
export const BackpackManageModal = lazyPanel(() => import('../GameFeatures/Inventory/BackpackManageModal'));
export const KentPanel = lazyPanel(() => import('../GameFeatures/Trading/Kent'));
export const NewTrainPanel = lazyPanel(() => import('../GameFeatures/Trading/NewTrain'));
export const CarnivalPanel = lazyPanel(() => import('../GameFeatures/Carnival/Carnival'));
export const CourthousePanel = lazyPanel(() => import('../GameFeatures/Government/Courthouse'));
export const CraftingStation = lazyPanel(() => import('../GameFeatures/Crafting/CraftingStation'));
export const FarmHouse = lazyPanel(() => import('../GameFeatures/Crafting/FarmHouse'));
export const FarmHandPanel = lazyPanel(() => import('../GameFeatures/FarmHands/FarmHand.js'));
export const ShopStation = lazyPanel(() => import('../GameFeatures/Crafting/ShopStation'));
export const ScrollStation = lazyPanel(() => import('../GameFeatures/Crafting/ScrollStation'));
export const PetPanel = lazyPanel(() => import('../GameFeatures/Pets/PetPanel'));
export const CropPanel = lazyPanel(() => import('../GameFeatures/Farming/CropPanel.js'));
export const DecoPanel = lazyPanel(() => import('../GameFeatures/Deco/DecoPanel'));
export const DoorPanel = lazyPanel(() => import('../GameFeatures/Doors/DoorPanel'));
export const TradeStall = lazyPanel(() => import('../GameFeatures/Trading/TradeStall'));
export const Mailbox = lazyPanel(() => import('../GameFeatures/Mailbox/Mailbox'));
export const OffSeasonModal = lazyPanel(() => import('../GameFeatures/Seasons/OffSeasonModal.js'));
export const TownNewsPanel = lazyPanel(() => import('./Panels/TownNewsPanel.js'));
export const SeasonPanel = lazyPanel(() => import('../GameFeatures/Seasons/SeasonPanel'));
export const SocialPanel = lazyPanel(() => import('../GameFeatures/Social/SocialPanel'));
export const CombatPanel = lazyPanel(() => import('../GameFeatures/Combat/CombatPanel'));
export const ShareModal = lazyPanel(() => import('./Modals/ShareModal'));
export const MapPanel = lazyPanel(() => import('../ZoomedOut/MapPanel'));
export const PrivacyPolicyModal = lazyPanel(() => import('./Modals/PrivacyPolicyModal'));
export const Chat = lazyPanel(() => import('../GameFeatures/Chat/Chat'));
