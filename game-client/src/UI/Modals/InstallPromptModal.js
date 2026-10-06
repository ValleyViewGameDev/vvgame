import React from 'react';
import Modal from './Modal';
import { useStrings } from '../StringsContext';
import '../Buttons/SharedButtons.css';
import './InstallPromptModal.css';

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '') && !window.MSStream;
export const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
export const isPhone = () => { try { return window.matchMedia('(pointer: coarse)').matches; } catch (_) { return false; } };
const DISMISS_KEY = 'vv_install_prompt_dismissed';
export const installPromptDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return true; } };
export const dismissInstallPrompt = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* storage off */ } };

/**
 * InstallPromptModal (docs/backlog.md BL-1): one invitation to add the game to the home
 * screen, shown on a phone browser at a moment of earned goodwill and never inside the
 * installed app. iOS gets the Share → Add to Home Screen instruction; Android gets the
 * captured beforeinstallprompt event (App.js keeps it in a ref). "Not now" is remembered
 * per device.
 */
export default function InstallPromptModal({ deferredPrompt, onClose }) {
  const strings = useStrings();
  const ios = isIOS();
  const canPrompt = !ios && !!deferredPrompt;
  const install = async () => {
    try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch (_) { /* declined */ }
    dismissInstallPrompt();
    onClose();
  };
  const later = () => { dismissInstallPrompt(); onClose(); };
  return (
    <Modal size="small" className="install-modal" onClose={later} title={strings[4112]}>
      <img className="install-logo" src="/logo192.png" alt="" width="64" height="64" />
      <p className="install-body">{ios ? strings[4113] : canPrompt ? strings[4114] : strings[4120]}</p>
      <div className="shared-buttons install-actions">
        <button className="btn-basic btn-neutral" onClick={later}>{strings[4116]}</button>
        {canPrompt && <button className="btn-basic btn-success" onClick={install}>{strings[4115]}</button>}
      </div>
    </Modal>
  );
}
