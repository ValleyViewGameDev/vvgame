// MOVE THIS TO A HELPER COMPONENT:  Function to format the countdown
// ✅ Ensures endTime is a valid Date object before doing calculations.
export const formatCountdown = (endTime, now) => {
    if (!endTime || endTime <= now) return "0d 0h 0m 0s"; // ✅ Show when expired
  
    const timeDiff = endTime - now;
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
  
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }; 