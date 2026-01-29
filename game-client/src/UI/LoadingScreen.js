/**
 * LoadingScreen - Displays during app initialization
 *
 * Shows the ValleyViewLoadScreen.png with an animated hourglass while
 * the app loads all required data (tileTypes, allGridTypes, etc.)
 *
 * This ensures no rendering occurs until all data is ready.
 *
 * POSITIONING: Matches the .keyart-wrapper CSS used for the logged-out state.
 * - Fixed position within the homestead container area
 * - Accounts for header (85px top) and nav column (240px left)
 */

import React, { useEffect } from 'react';

const LoadingScreen = ({ message = 'Loading Valley View...' }) => {
  // Log when LoadingScreen mounts/unmounts to verify it's being rendered
  useEffect(() => {
    console.log('⏳ LoadingScreen mounted');
    return () => console.log('⏳ LoadingScreen unmounted');
  }, []);

  return (
    <div
      className="keyart-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      {/* Background image - matches keyart-image class sizing */}
      <img
        src="/assets/images/ValleyViewLoadScreen.png"
        alt="Valley View"
        className="keyart-image"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 0.9,
        }}
      />

      {/* Overlay content - centered on the image */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        {/* Animated hourglass */}
        <div
          style={{
            fontSize: '64px',
            animation: 'loadingSpinner 2s ease-in-out infinite',
          }}
        >
          ⏳
        </div>

        {/* Loading message */}
        <div
          style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
            padding: '10px 20px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '8px',
          }}
        >
          {message}
        </div>
      </div>

      {/* CSS animation for hourglass */}
      <style>
        {`
          @keyframes loadingSpinner {
            0% { transform: rotate(0deg); }
            50% { transform: rotate(180deg); }
            100% { transform: rotate(180deg); }
          }
        `}
      </style>
    </div>
  );
};

export default LoadingScreen;
