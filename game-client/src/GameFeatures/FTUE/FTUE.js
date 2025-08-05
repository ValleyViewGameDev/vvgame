import React, { useState } from 'react';
import axios from 'axios';
import API_BASE from '../../config';
import { useStrings } from '../../UI/StringsContext';
import './FTUE.css';

const FTUE = ({ currentPlayer, setCurrentPlayer, onClose }) => {
  const strings = useStrings();
  const [currentStep, setCurrentStep] = useState(0);
  
  // Define tutorial steps with corresponding string indices and images
  const tutorialSteps = [
    {
      titleKey: 701,
      bodyKey: 702,
      image: 'ftue-welcome.png'
    },
    {
      titleKey: 703,
      bodyKey: 704,
      image: 'ftue-gathering.png'
    },
    {
      titleKey: 705,
      bodyKey: 706,
      image: 'ftue-trading.png'
    },
    {
      titleKey: 707,
      bodyKey: 708,
      image: 'ftue-skills.png'
    },
    {
      titleKey: 709,
      bodyKey: 710,
      image: 'ftue-exploring.png'
    },
    {
      titleKey: 711,
      bodyKey: 712,
      image: 'ftue-quests.png'
    },
    {
      titleKey: 713,
      bodyKey: 714,
      image: 'ftue-valley.png'
    }
  ];

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTutorial = async () => {
    try {
      // Update the player's firsttimeuser flag to false
      const response = await axios.post(`${API_BASE}/api/update-profile`, {
        playerId: currentPlayer.playerId,
        updates: { firsttimeuser: false }
      });
      
      if (response.data.success) {
        // Update local player state
        setCurrentPlayer(prev => ({
          ...prev,
          firsttimeuser: false
        }));
        
        // Close the tutorial
        onClose();
      }
    } catch (error) {
      console.error('Error completing tutorial:', error);
      // Close anyway to not block the user
      onClose();
    }
  };

  const handleSkip = () => {
    completeTutorial();
  };

  const currentTutorialStep = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <div className="ftue-overlay">
      <div className="ftue-modal">
        <div className="ftue-header">
          <h2>{strings[currentTutorialStep.titleKey]}</h2>
          <button className="ftue-skip-button" onClick={handleSkip}>
            {strings[730]}
          </button>
        </div>
        
        <div className="ftue-content">
          <div className="ftue-image-container">
            <img 
              src={`/assets/${currentTutorialStep.image}`} 
              alt={strings[currentTutorialStep.titleKey]}
              className="ftue-image"
            />
          </div>
          
          <div className="ftue-text">
            <p>{strings[currentTutorialStep.bodyKey]}</p>
          </div>
        </div>
        
        <div className="ftue-footer">
          <div className="ftue-progress">
            {tutorialSteps.map((_, index) => (
              <div 
                key={index}
                className={`ftue-progress-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>
          
          <div className="ftue-buttons">
            <button 
              className="ftue-button ftue-button-secondary" 
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              {strings[732]}
            </button>
            
            <button 
              className="ftue-button ftue-button-primary" 
              onClick={handleNext}
            >
              {isLastStep ? strings[733] : strings[731]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FTUE;