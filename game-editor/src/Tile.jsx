import React from 'react';

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
        background: 
          tile.type === "**" ? "#fff" : // Ensure "None" tiles reset to white
          tile.type === "GR" ? "#3dc43d" :
          tile.type === "SL" ? "#8b989c" :
          tile.type === "DI" ? "#c0834a" :
          tile.type === "WA" ? "#58cad8" :
          tile.type === "PA" ? "#dab965" :
          tile.type === "LV" ? "#c4583d" :
          tile.type === "SA" ? "#fbde00" :
          tile.type === "CB" ? "#797e85ff" :
          tile.type === "DU" ? "#000000ff" :
          tile.type === "ZZ" ? "#ffffff" :

          "#fff", // Default for unknown types
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
      {/* Multi-tile resource rendering */}
      {multiTileResource ? (
        <div
          style={{
            fontSize: `${tileSize * 0.85 * multiTileResource.range}px`,
            width: `${tileSize * multiTileResource.range}px`,
            height: `${tileSize * multiTileResource.range}px`,
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