// Shared function to format countdown timers consistently across the app
// ✅ Ensures endTime is a valid Date object before doing calculations.
export const formatCountdown = (endTime, now) => {
    if (!endTime || endTime <= now) return "0s"; 
  
    const timeDiff = endTime - now;
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
  
    // Build the string dynamically, only showing non-zero values
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`); // Always show seconds if nothing else
    
    return parts.join(' ');
};

// Compact countdown format for small UI elements
// Shows only the two most significant time units:
// - >=24h: XXd XXh
// - >=60 min and <24h: XXh XXm
// - <60 min: XXm XXs
/**
 * The condensed countdown: never more than TWO units, the two largest that apply.
 *   >= 1 day: "2d 4h" · >= 1 hour: "3h 12m" · >= 1 minute: "4m 30s" · under a minute: "45s".
 * Used by the crafting station slots and the HUD timers under Season / Town News
 * (UI/HudCountdown.js); use it anywhere a timer must stay short.
 */
export const formatCompactCountdown = (endTime, now) => {
    if (!endTime || endTime <= now) return "0s";

    const totalSeconds = Math.floor((endTime - now) / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);

    if (days >= 1) return `${days}d ${totalHours % 24}h`;
    if (totalHours >= 1) return `${totalHours}h ${totalMinutes % 60}m`;
    if (totalMinutes >= 1) return `${totalMinutes}m ${totalSeconds % 60}s`;
    return `${totalSeconds}s`;
};

// Utility function to format numbers with locale-specific comma separators
// e.g., 1000 -> "1,000", 1000000 -> "1,000,000"
export const formatNumber = (number) => {
    if (typeof number === 'number') {
        return number.toLocaleString();
    }
    if (typeof number === 'string' && !isNaN(Number(number))) {
        return Number(number).toLocaleString();
    }
    return number; // Return as-is if it's not a number
};

// Shared function to format static durations (e.g., "Time needed: X")
// Only shows non-zero time units, stopping at the smallest non-zero unit
export const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return "0s";
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`); // Always show seconds if nothing else
    
    // For static durations, only show the first 2 most significant units
    // e.g., "2d 16h" instead of "2d 16h 0m 0s"
    return parts.slice(0, 2).join(' ');
}; 