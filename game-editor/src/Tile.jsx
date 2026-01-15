import React from 'react';
import { getLayoutKeyColor } from './tileConfig';

const Tile = ({ x, y, tile, updateTile, isSelected, setSelectedTile, tileSize, masterResources, multiTileResource }) => {
  const resourceSymbol = (() => {
    if (!tile.resource) return "";
    const res = masterResources.find(r => r.type === tile.resource);
    return res?.symbol || "";
  })();

  return (
    <div
      onClick={() => updateTile(x, y)}
      style={{
        width: `${tileSize}px`,
        height: `${tileSize}px`,
        background: getLayoutKeyColor(tile.type),
        border: isSelected ? "3px solid red" : "1px solid black",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: `${tileSize * 0.6}px`,
        userSelect: "none",
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Multi-tile resource rendering (size is tile footprint) */}
      {multiTileResource ? (
        <div
          style={{
            fontSize: `${tileSize * 0.85 * multiTileResource.size}px`,
            width: `${tileSize * multiTileResource.size}px`,
            height: `${tileSize * multiTileResource.size}px`,
            position: 'absolute',
            left: '0',
            bottom: '0',  // Changed from top: '0' to bottom: '0' for bottom-left anchoring
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {resourceSymbol}
        </div>
      ) : (
        // Single-tile resource rendering
        resourceSymbol
      )}
    </div>
  );
};

export default Tile;