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

  // Load SVG file (with caching) - supports different directories
  async loadSVG(svgFileName, isOverlay = false) {
    const cacheKey = isOverlay ? `overlay-${svgFileName}` : svgFileName;
    
    if (this.svgCache.has(cacheKey)) {
      return this.svgCache.get(cacheKey);
    }

    // Prevent duplicate loading
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    const directory = isOverlay ? '/assets/overlays/' : '/assets/resources/';
    const loadPromise = fetch(`${directory}${svgFileName}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load SVG: ${svgFileName}`);
        }
        return response.text();
      })
      .then(svgText => {
        this.svgCache.set(cacheKey, svgText);
        this.loadingPromises.delete(cacheKey);
        return svgText;
      })
      .catch(error => {
        console.warn(`SVG asset not found: ${svgFileName}`, error);
        this.loadingPromises.delete(cacheKey);
        return null;
      });

    this.loadingPromises.set(cacheKey, loadPromise);
    return loadPromise;
  }

  // Create high-quality texture from SVG at specific size
  async createSVGTexture(svgText, size) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.error('❌ [SVG TEXTURE] Failed to get 2d context for offscreen canvas');
        resolve(null);
        return;
      }

      // Enable better rendering quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Convert SVG to data URL BEFORE creating Image to ensure blob is ready
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // Create image from SVG
      const img = new Image();

      // Set up timeout to catch hanging loads
      const loadTimeout = setTimeout(() => {
        console.warn(`⏰ [SVG TEXTURE] Image load timed out for size ${size}`);
        URL.revokeObjectURL(url);
        resolve(null);
      }, 5000);

      img.onload = () => {
        clearTimeout(loadTimeout);
        try {
          // Render SVG at high quality
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas);
        } catch (error) {
          console.error('❌ [SVG TEXTURE] Error drawing image to canvas:', error);
          resolve(null);
        } finally {
          // Clean up object URL after drawing is complete
          URL.revokeObjectURL(url);
        }
      };

      img.onerror = (error) => {
        clearTimeout(loadTimeout);
        console.warn('❌ [SVG TEXTURE] Failed to load SVG image:', error);
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    });
  }

  // Get or create cached texture for SVG asset
  async getSVGTexture(svgFileName, targetSize, isOverlay = false) {
    // Account for device pixel ratio for crisp rendering on high-DPI displays
    const devicePixelRatio = window.devicePixelRatio || 1;
    const renderSize = Math.ceil(targetSize * devicePixelRatio);

    // Cache key includes both target and render size for proper cache hits
    const cacheKey = `${isOverlay ? 'overlay-' : ''}${svgFileName}-${targetSize}-${renderSize}`;

    // Return cached texture if available
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey);
    }

    try {
      // Load SVG and create texture
      const svgText = await this.loadSVG(svgFileName, isOverlay);
      if (!svgText) {
        console.warn(`❌ [SVG MANAGER] No SVG text loaded for ${svgFileName}`);
        return null;
      }

      // Rasterize at higher resolution for crisp display on high-DPI screens
      const texture = await this.createSVGTexture(svgText, renderSize);
      if (texture) {
        this.textureCache.set(cacheKey, texture);
      } else {
        console.warn(`❌ [SVG MANAGER] Failed to create texture for ${svgFileName}`);
      }
      return texture;
    } catch (error) {
      console.error(`❌ [SVG MANAGER] Error creating SVG texture for ${svgFileName}:`, error);
      return null;
    }
  }

  // Get overlay texture (convenience method)
  async getOverlayTexture(overlayFileName, targetSize) {
    return this.getSVGTexture(overlayFileName, targetSize, true);
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