// SVG Asset Manager - handles loading and caching SVG assets for canvas rendering

class SVGAssetManager {
  constructor() {
    this.svgCache = new Map(); // SVG string cache
    this.textureCache = new Map(); // Rendered bitmap cache
    this.loadingPromises = new Map(); // Prevent duplicate loads
    
    // Default zoom tiers (will be updated from globalTuning)
    this.ZOOM_TIERS = [16, 34, 50, 68, 100, 150]; // fallback values
  }

  // Get the best zoom tier for a target size with high-DPI support
  getBestZoomTier(targetSize) {
    // Account for device pixel ratio for crisp rendering
    const devicePixelRatio = window.devicePixelRatio || 1;
    const adjustedSize = targetSize * Math.max(devicePixelRatio, 1.5); // Always render at least 1.5x for sharpness
    
    return this.ZOOM_TIERS.find(tier => tier >= adjustedSize) || this.ZOOM_TIERS[this.ZOOM_TIERS.length - 1];
  }

  // Load SVG file (with caching)
  async loadSVG(svgFileName) {
    if (this.svgCache.has(svgFileName)) {
      return this.svgCache.get(svgFileName);
    }

    // Prevent duplicate loading
    if (this.loadingPromises.has(svgFileName)) {
      return this.loadingPromises.get(svgFileName);
    }

    const loadPromise = fetch(`/assets/resources/${svgFileName}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load SVG: ${svgFileName}`);
        }
        return response.text();
      })
      .then(svgText => {
        this.svgCache.set(svgFileName, svgText);
        this.loadingPromises.delete(svgFileName);
        return svgText;
      })
      .catch(error => {
        console.warn(`SVG asset not found: ${svgFileName}`, error);
        this.loadingPromises.delete(svgFileName);
        return null;
      });

    this.loadingPromises.set(svgFileName, loadPromise);
    return loadPromise;
  }

  // Create high-quality texture from SVG at specific size
  async createSVGTexture(svgText, size) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      
      // Enable better rendering quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Create image from SVG
      const img = new Image();
      img.onload = () => {
        // Render SVG at high quality
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas);
        
        // Clean up object URL
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        console.warn('Failed to render SVG to canvas');
        URL.revokeObjectURL(img.src);
        resolve(null);
      };

      // Convert SVG to data URL
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.src = url;
    });
  }

  // Get or create cached texture for SVG asset
  async getSVGTexture(svgFileName, targetSize) {
    const tier = this.getBestZoomTier(targetSize);
    const cacheKey = `${svgFileName}-${tier}`;

    // Return cached texture if available
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey);
    }

    try {
      // Load SVG and create texture
      const svgText = await this.loadSVG(svgFileName);
      if (!svgText) return null;

      const texture = await this.createSVGTexture(svgText, tier);
      if (texture) {
        this.textureCache.set(cacheKey, texture);
      }
      return texture;
    } catch (error) {
      console.error(`Error creating SVG texture for ${svgFileName}:`, error);
      return null;
    }
  }

  // Update zoom tiers from globalTuning
  updateZoomTiers(globalTuning) {
    if (!globalTuning) {
      console.warn('No globalTuning provided, using default zoom tiers');
      return;
    }
    
    // Extract zoom values from globalTuning
    const baseZooms = [
      globalTuning.farZoom || 16,
      globalTuning.closeZoom || 34, 
      globalTuning.closerZoom || 50
    ];
    
    // Add higher resolution variants for crisp rendering
    const highResVariants = baseZooms.map(zoom => [
      zoom * 1.5, // 1.5x for sharpness
      zoom * 2,   // 2x for high-DPI
      zoom * 3    // 3x for very high-DPI
    ]).flat();
    
    // Combine and sort unique values
    this.ZOOM_TIERS = [...new Set([...baseZooms, ...highResVariants])].sort((a, b) => a - b);
    
    console.log('Updated SVG zoom tiers from globalTuning:', this.ZOOM_TIERS);
  }

  // Clear cache (useful for development/testing)
  clearCache() {
    this.svgCache.clear();
    this.textureCache.clear();
    this.loadingPromises.clear();
  }

  // Get cache stats for debugging
  getCacheStats() {
    return {
      svgFiles: this.svgCache.size,
      textures: this.textureCache.size,
      loading: this.loadingPromises.size
    };
  }
}

// Export singleton instance
export default new SVGAssetManager();