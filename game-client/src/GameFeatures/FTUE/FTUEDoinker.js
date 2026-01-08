import { useState, useEffect, useRef } from 'react';
import GlobalGridStateTilesAndResources from '../../GridState/GlobalGridStateTilesAndResources';
import './FTUE.css';

/**
 * FTUEDoinker - A bouncing red arrow that points to a target resource on the grid
 *
 * Props:
 * - doinkerTarget: string - The resource type to point at (e.g., "Dungeon Exit")
 * - TILE_SIZE: number - The current tile size for positioning
 * - visible: boolean - Whether the doinker should be visible
 */
const FTUEDoinker = ({ doinkerTarget, TILE_SIZE, visible }) => {
  const [targetPosition, setTargetPosition] = useState(null);
  const foundTargetRef = useRef(false);

  // Find the target resource position when doinkerTarget changes
  useEffect(() => {
    // Reset when target changes
    foundTargetRef.current = false;

    if (!doinkerTarget || !visible) {
      setTargetPosition(null);
      return;
    }

    const findTargetResource = () => {
      const resources = GlobalGridStateTilesAndResources.getResources();

      if (!resources || resources.length === 0) {
        console.log('👆 Doinker: No resources loaded yet, waiting...');
        return null;
      }

      // Find the resource with matching type
      const targetResource = resources.find(res => res.type === doinkerTarget);

      if (targetResource) {
        console.log(`👆 Doinker: Found target "${doinkerTarget}" at (${targetResource.x}, ${targetResource.y})`);
        return {
          x: targetResource.x,
          y: targetResource.y,
          // Account for multi-tile resources (use center if range > 1)
          range: targetResource.range || 1
        };
      } else {
        console.log(`👆 Doinker: Target "${doinkerTarget}" not found in resources`);
        return null;
      }
    };

    // Initial search
    const position = findTargetResource();
    if (position) {
      setTargetPosition(position);
      foundTargetRef.current = true;
    }

    // Set up an interval to re-check in case resources load after component mounts
    // or if the target resource moves/changes
    const interval = setInterval(() => {
      if (!foundTargetRef.current) {
        const pos = findTargetResource();
        if (pos) {
          setTargetPosition(pos);
          foundTargetRef.current = true;
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [doinkerTarget, visible]);

  // Don't render if not visible or no target found
  if (!visible || !targetPosition) {
    return null;
  }

  // Calculate pixel position
  // Center the doinker on the target tile (or center of multi-tile resource)
  const centerOffset = (targetPosition.range - 1) / 2;
  const pixelX = (targetPosition.x + centerOffset + 0.5) * TILE_SIZE;
  const pixelY = (targetPosition.y - centerOffset + 0.5) * TILE_SIZE;

  // Arrow dimensions (responsive to tile size)
  const arrowHeight = Math.max(30, TILE_SIZE * 0.8);
  const arrowWidth = Math.max(20, TILE_SIZE * 0.5);

  return (
    <div
      className="ftue-doinker"
      style={{
        left: `${pixelX}px`,
        top: `${pixelY - arrowHeight - 10}px`, // Position above the target with small gap
        width: `${arrowWidth}px`,
        height: `${arrowHeight}px`,
      }}
    >
      {/* SVG Arrow pointing down */}
      <svg
        width={arrowWidth}
        height={arrowHeight}
        viewBox="0 0 40 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="ftue-doinker-arrow"
      >
        {/* Arrow body */}
        <path
          d="M15 0 L15 35 L5 35 L20 60 L35 35 L25 35 L25 0 Z"
          fill="#e53935"
          stroke="#b71c1c"
          strokeWidth="2"
        />
        {/* Highlight */}
        <path
          d="M17 2 L17 33 L20 33 L20 2 Z"
          fill="#ff6f60"
          opacity="0.6"
        />
      </svg>
    </div>
  );
};

export default FTUEDoinker;
