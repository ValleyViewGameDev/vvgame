import API_BASE from '../config';
import axios from 'axios';

// Browser, OS and device diagnostics stored on the player at registration (ftueFeedback.*).
// Shared by the typed signup (Authentication/CreateAccount.js) and the silent account (silentAccount.js).
// Detect browser type from userAgent
export const getBrowserType = () => {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  return 'Unknown';
};

// Detect OS type and version from userAgent
export const getOSType = () => {
  const userAgent = navigator.userAgent;

  // Windows: "Windows NT 10.0" -> "Windows 10" (NT 10.0 = Win 10/11, 6.3 = 8.1, 6.1 = 7)
  const windowsMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
  if (windowsMatch) {
    const ntVersion = windowsMatch[1];
    const versionMap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP' };
    return `Windows ${versionMap[ntVersion] || ntVersion}`;
  }

  // macOS: "Mac OS X 10_15_7" or "Mac OS X 10.15.7"
  const macMatch = userAgent.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
  if (macMatch) {
    return `MacOS ${macMatch[1].replace(/_/g, '.')}`;
  }

  // iOS: "iPhone OS 15_0" or "CPU OS 15_0"
  const iosMatch = userAgent.match(/(?:iPhone|iPad|iPod).*?OS (\d+[._]\d+)/);
  if (iosMatch) {
    return `iOS ${iosMatch[1].replace(/_/g, '.')}`;
  }

  // Android: "Android 12"
  const androidMatch = userAgent.match(/Android (\d+(?:\.\d+)?)/);
  if (androidMatch) {
    return `Android ${androidMatch[1]}`;
  }

  // Linux (no version typically available)
  if (userAgent.includes('Linux')) return 'Linux';

  return 'Unknown';
};

// Gather device and network diagnostics for analytics
export const getDiagnostics = async () => {
  // Measure latency with a ping
  let latency = null;
  try {
    const pingStart = performance.now();
    await axios.get(`${API_BASE}/api/ping`);
    latency = Math.round(performance.now() - pingStart);
  } catch {
    latency = -1; // Failed to measure
  }

  // Check WebGL support
  let webglSupported = false;
  try {
    const canvas = document.createElement('canvas');
    webglSupported = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    webglSupported = false;
  }

  return {
    // Network
    latency,
    connectionType: navigator.connection?.effectiveType || null, // '4g', '3g', '2g', 'slow-2g'
    downlink: navigator.connection?.downlink || null, // Mbps

    // Screen and viewport
    screenWidth: window.screen?.width || null,
    screenHeight: window.screen?.height || null,
    viewportWidth: window.innerWidth || null,
    viewportHeight: window.innerHeight || null,
    devicePixelRatio: window.devicePixelRatio || null,

    // Device capabilities
    deviceMemory: navigator.deviceMemory || null, // GB (Chrome only)
    hardwareConcurrency: navigator.hardwareConcurrency || null, // CPU cores

    // Platform detection
    isMobile: /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,

    // Rendering capability
    webglSupported,

    // Timezone
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
  };
};

