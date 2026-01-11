import React from 'react';
import { generateResourceTooltip } from './RenderDynamicElements';

/**
 * DOM-based resource renderer - only renders the resource symbols themselves
 * Overlays and tooltips are handled by RenderDynamicElements
 */
export const RenderResourcesDOM = ({
  resources,
  TILE_SIZE,
  handleTileClick,
  setHoverTooltip,
  strings
}) => {

  return (
    <>
      {/* Only create DOM elements for actual resources */}
      {resources.map((resource) => {
        const tileSpan = resource.size || 1;

        // For multi-tile resources, create clickable tiles for the entire area
        const tiles = [];
        for (let dy = 0; dy < tileSpan; dy++) {
          for (let dx = 0; dx < tileSpan; dx++) {
            const tileX = resource.x + dx;
            const tileY = resource.y - dy; // Subtract because resources grow upward
            
            tiles.push(
              <div
                key={`resource-tile-${resource.id}-${dx}-${dy}`}
                className="resource-tile"
                data-resource-type={resource.type}
                data-resource-x={resource.x}
                data-resource-y={resource.y}
                onClick={() => handleTileClick(tileY, tileX)}
                style={{
                  position: 'absolute',
                  top: tileY * TILE_SIZE,
                  left: tileX * TILE_SIZE,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  cursor: 'pointer',
                  zIndex: 10, // Above tiles but below PCs (16) and NPCs (15)
                  pointerEvents: 'auto',
                }}
              />
            );
          }
        }
        
        return (
          <React.Fragment key={`resource-${resource.id || `${resource.x}-${resource.y}-${resource.type}`}`}>
            {tiles}
            {/* Resource Symbol - render at anchor position */}
            <div
              className="resource-overlay"
              style={{
                position: 'absolute',
                top: resource.y * TILE_SIZE,
                left: resource.x * TILE_SIZE,
                fontSize: range > 1 
                  ? resource.action === 'wall'
                    ? `${TILE_SIZE * 1.2 * range}px` // Multi-tile walls
                    : `${TILE_SIZE * 0.8 * range}px` // Other multi-tile resources
                  : resource.action === 'wall'
                    ? `${TILE_SIZE * 1.1}px` // Single-tile walls
                    : `${TILE_SIZE * 0.7}px`, // Other single-tile resources
                width: range > 1 ? `${TILE_SIZE * range}px` : TILE_SIZE,
                height: range > 1 ? `${TILE_SIZE * range}px` : TILE_SIZE,
                transform: range > 1 
                  ? resource.action === 'wall'
                    ? `translateY(${-TILE_SIZE * (range - 1) + 3}px)` // Multi-tile walls shifted down 3px
                    : `translateY(${-TILE_SIZE * (range - 1)}px)` // Other multi-tile resources
                  : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: range > 1 ? 12 : 11, // Above tiles but below NPCs and PCs
                pointerEvents: 'none',
                overflow: 'visible',
                lineHeight: resource.action === 'wall' ? '1' : 'normal',
              }}
            >
              {resource.symbol || ''}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
};

export default RenderResourcesDOM;