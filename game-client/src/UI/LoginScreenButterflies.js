/**
 * LoginScreenButterflies - PixiJS butterfly VFX for the login screen
 *
 * Creates a standalone PixiJS canvas overlay for the butterfly animation
 * on the ValleyViewLoadScreen. Uses the same ButterfliesEffect from AmbientVFX.
 */

import React, { useEffect, useRef } from 'react';
import { Application } from 'pixi.js-legacy';
import { ButterfliesEffect } from '../VFX/AmbientVFX';

const LoginScreenButterflies = () => {
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const effectRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Small delay to ensure canvas is fully mounted
    const initTimeout = setTimeout(() => {
      try {
        // Create a PixiJS app sized to the keyart area
        // The keyart-wrapper is positioned after the nav column (240px) and below header (85px)
        const width = 800;  // Approximate width of keyart area
        const height = 600; // Approximate height of keyart area

        const app = new Application({
          view: canvasRef.current,
          width,
          height,
          backgroundAlpha: 0, // Transparent background
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        appRef.current = app;

        // Create butterfly effect - use grid dimensions that match the canvas
        // TILE_SIZE of 40 means roughly 20x15 grid for 800x600 canvas
        const gridWidth = 20;
        const gridHeight = 15;
        const TILE_SIZE = 40;

        const butterflies = new ButterfliesEffect(app, gridWidth, gridHeight, TILE_SIZE);
        butterflies.container.alpha = 1; // Start fully visible (no fade in needed)
        app.stage.addChild(butterflies.container);
        butterflies.start();
        effectRef.current = butterflies;
      } catch (error) {
        console.error('LoginScreenButterflies: Failed to initialize PixiJS', error);
      }
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      // Cleanup
      if (effectRef.current) {
        effectRef.current.stop();
        effectRef.current.destroy();
        effectRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        appRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // Allow clicks to pass through
        zIndex: 5, // Above the background image but below UI elements
      }}
    />
  );
};

export default LoginScreenButterflies;
