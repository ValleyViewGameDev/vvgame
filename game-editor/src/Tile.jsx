import React from 'react';

const Tile = ({ x, y, tile, updateTile, isSelected, setSelectedTile, tileSize, masterResources, multiTileResource, isCoveredByMultiTile, coveringResource }) => {
  const resourceSymbol = (() => {
    if (!tile.resource) return "";
    const res = masterResources.find(r => r.type === tile.resource);
    return res?.symbol || "";
  })();
  
  // If this tile is covered by a multi-tile resource, make it semi-transparent
  const opacity = isCoveredByMultiTile ? 0.3 : 1;

  return (
    <div 
      onClick={() => updateTile(x, y)} 
      style={{
        width: `${tileSize}px`,
        height: `${tileSize}px`,
        background: 
          tile.type === "**" ? "#fff" : // Ensure "None" tiles reset to white
          tile.type === "GR" ? "#3dc43d" :
          tile.type === "SL" ? "#8b989c" :
          tile.type === "DI" ? "#c0834a" :
          tile.type === "WA" ? "#58cad8" :
          tile.type === "PA" ? "#dab965" :
          tile.type === "LV" ? "#c4583d" :
          tile.type === "SA" ? "#fbde00" :
          "#fff", // Default for unknown types
        border: isSelected ? "3px solid red" : "1px solid black",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: `${tileSize * 0.6}px`,
        userSelect: "none",
        opacity: opacity,
        position: "relative",
      }}
    >
      {/* Multi-tile resource rendering */}
      {multiTileResource ? (
        <div
          style={{
            fontSize: `${tileSize * 0.85 * multiTileResource.range}px`,
            width: `${tileSize * multiTileResource.range}px`,
            height: `${tileSize * multiTileResource.range}px`,
            position: 'absolute',
            left: '0',
            top: '0',
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
      ) : isCoveredByMultiTile ? (
        // Show a subtle indicator that this tile is part of a multi-tile object
        <div
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            fontSize: `${tileSize * 0.3}px`,
            color: '#888',
            pointerEvents: 'none',
          }}
        >
          ◆
        </div>
      ) : (
        // Single-tile resource rendering
        resourceSymbol
      )}
    </div>
  );
};

export default Tile;