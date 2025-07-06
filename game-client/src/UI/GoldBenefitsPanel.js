import React, { memo } from 'react';
import Panel from './Panel'; 
import { handlePurchase } from '../Store/Store';
import './SharedButtons.css'; 
import { useStrings } from './StringsContext';


const GoldBenefitsPanel = memo(({ currentPlayer, updateStatus, onClose }) => {
  
  const strings = useStrings();
  const isGold = currentPlayer.accountStatus === 'Gold';

  return (
    <Panel onClose={onClose} descriptionKey="1027" titleKey="1127" panelName="GoldBenefitsPanel">
      <div className="panel-content">

        <div className="standard-buttons">
          {isGold ? (
            <p>{strings[9060]}</p>
          ) : (
            <button className="btn-gold" onClick={() => handlePurchase(1, currentPlayer, updateStatus)}>{strings[9061]}</button>
          )}
        </div>
<br />
        <h2>{strings[9050]}</h2>
        <p>{strings[9051]}</p>
        <p>{strings[9052]}</p>
        <p>{strings[9053]}</p>
        <p>{strings[9054]}</p>
        <p>{strings[9055]}</p>
        <p>{strings[9056]}</p>
        <p>{strings[9057]}</p>
        <p>{strings[9058]}</p>

      </div>
    </Panel>
  );
});

export default GoldBenefitsPanel;
