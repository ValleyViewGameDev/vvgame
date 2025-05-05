// GlobalGridStateTilesAndResources.js
const GlobalGridStateTilesAndResources = {
    tiles: [],
    resources: [],
  
    // Setter for tiles
    setTiles(newTiles) {
      this.tiles = newTiles;
      //console.log('Global tiles updated:', this.tiles);
    },
  
    // Setter for resources
    setResources(newResources) {
      this.resources = newResources;
      //console.log('Global resources updated:', this.resources);
    },
  
    // Getter for tiles
    getTiles() {
      return this.tiles;
    },
  
    // Getter for resources
    getResources() {
      return this.resources;
    },
  };
  
  export default GlobalGridStateTilesAndResources;