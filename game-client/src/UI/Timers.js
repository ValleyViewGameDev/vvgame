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