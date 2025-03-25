import React from 'react';

const Tile = ({ x, y, tile, updateTile, isSelected, setSelectedTile, tileSize }) => {
  return (
    <div 
      onClick={() => updateTile(x, y)} 
      style={{
        width: `${tileSize}px`,
        height: `${tileSize}px`,

        background: 
          tile.type === "**" ? "#fff" : // ✅ Ensure "None" tiles reset to white
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
      }}
    >
      {tile.resource ? tile.resource : ""}
    </div>
  );
};

export default Tile;