/**
 * Utility functions for tooltip positioning with boundary checking
 * Ensures tooltips stay within the game container bounds
 */

/**
 * Calculate tooltip position with boundary checking to keep it within the game container
 * @param {number} mouseX - Mouse X position (clientX)
 * @param {number} mouseY - Mouse Y position (clientY) 
 * @param {string} gameContainerSelector - CSS selector for game container (default: '.homestead')
 * @returns {Object} - Adjusted tooltip position {x, y}
 */
export function calculateTooltipPosition(mouseX, mouseY, gameContainerSelector = '.homestead') {
  const gameContainer = document.querySelector(gameContainerSelector);
  
  // Fallback to original position if container not found
  if (!gameContainer) {
    return { x: mouseX, y: mouseY };
  }
  
  // Get container bounds relative to viewport
  const containerRect = gameContainer.getBoundingClientRect();
  
  // Tooltip dimensions - estimate based on typical tooltip size
  const tooltipWidth = 120; // Estimated tooltip width
  const tooltipHeight = 60; // Estimated tooltip height
  const margin = 10; // Margin from edges
  
  let adjustedX = mouseX;
  let adjustedY = mouseY;
  
  // Check horizontal boundaries
  // Since tooltip uses transform: translateX(-50%), we need to consider half width on each side
  const tooltipLeftEdge = mouseX - (tooltipWidth / 2);
  const tooltipRightEdge = mouseX + (tooltipWidth / 2);
  
  if (tooltipLeftEdge < containerRect.left + margin) {
    // Tooltip would go off left edge - move it right
    adjustedX = containerRect.left + margin + (tooltipWidth / 2);
  } else if (tooltipRightEdge > containerRect.right - margin) {
    // Tooltip would go off right edge - move it left
    adjustedX = containerRect.right - margin - (tooltipWidth / 2);
  }
  
  // Check vertical boundaries
  // Tooltip renders above the cursor (bottom: calc(100vh - y + 10px))
  // So we need to check if it would go off the top
  const tooltipTop = mouseY - tooltipHeight - 10; // 10px offset from cursor
  
  if (tooltipTop < containerRect.top + margin) {
    // Tooltip would go off top edge - position it below cursor instead
    adjustedY = mouseY + 20; // Position below cursor with some offset
  }
  
  // Check if positioning below would go off bottom edge
  if (adjustedY + tooltipHeight + margin > containerRect.bottom) {
    // Both above and below positions are problematic - keep it within bounds
    adjustedY = Math.max(containerRect.top + margin + tooltipHeight, 
                        Math.min(mouseY, containerRect.bottom - margin - tooltipHeight));
  }
  
  return { x: adjustedX, y: adjustedY };
}

/**
 * Enhanced version that also returns positioning mode for different CSS styles
 * @param {number} mouseX - Mouse X position (clientX)
 * @param {number} mouseY - Mouse Y position (clientY)
 * @param {string} gameContainerSelector - CSS selector for game container
 * @returns {Object} - {x, y, mode} where mode is 'above' or 'below'
 */
export function calculateTooltipPositionWithMode(mouseX, mouseY, gameContainerSelector = '.homestead') {
  const gameContainer = document.querySelector(gameContainerSelector);
  
  if (!gameContainer) {
    return { x: mouseX, y: mouseY, mode: 'above' };
  }
  
  const containerRect = gameContainer.getBoundingClientRect();
  const tooltipWidth = 120;
  const tooltipHeight = 60;
  const margin = 10;
  
  let adjustedX = mouseX;
  let adjustedY = mouseY;
  let mode = 'above'; // Default positioning mode
  
  // Horizontal boundary checking (same as basic version)
  const tooltipLeftEdge = mouseX - (tooltipWidth / 2);
  const tooltipRightEdge = mouseX + (tooltipWidth / 2);
  
  if (tooltipLeftEdge < containerRect.left + margin) {
    adjustedX = containerRect.left + margin + (tooltipWidth / 2);
  } else if (tooltipRightEdge > containerRect.right - margin) {
    adjustedX = containerRect.right - margin - (tooltipWidth / 2);
  }
  
  // Vertical boundary checking with mode detection
  const tooltipTopWhenAbove = mouseY - tooltipHeight - 10;
  const tooltipBottomWhenBelow = mouseY + 20 + tooltipHeight;
  
  if (tooltipTopWhenAbove < containerRect.top + margin) {
    // Would go off top - try positioning below
    if (tooltipBottomWhenBelow <= containerRect.bottom - margin) {
      // Can fit below
      adjustedY = mouseY;
      mode = 'below';
    } else {
      // Can't fit above or below - constrain to container
      adjustedY = containerRect.top + margin + tooltipHeight;
      mode = 'above';
    }
  } else if (tooltipBottomWhenBelow > containerRect.bottom - margin) {
    // Would go off bottom when positioned below - keep above
    adjustedY = mouseY;
    mode = 'above';
  } else {
    // Default above positioning works
    adjustedY = mouseY;
    mode = 'above';
  }
  
  return { x: adjustedX, y: adjustedY, mode };
}