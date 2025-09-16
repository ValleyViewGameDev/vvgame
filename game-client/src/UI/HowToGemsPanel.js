import React, { memo, useState, useEffect } from 'react';
import Panel from './Panel'; // Importing the shared Panel component
import { handlePurchase } from '../Store/Store';
import { useStrings } from './StringsContext';
import axios from 'axios';
import API_BASE from '../config';

const HowToGemsPanel = memo(({ currentPlayer, updateStatus, onClose }) => {

  const strings = useStrings();
  const [offers, setOffers] = useState({});

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/store-offers`);
        const offerData = response.data || [];
        // Convert array to object keyed by id for easy lookup
        const offerMap = {};
        offerData.forEach(offer => {
          offerMap[offer.id] = offer;
        });
        setOffers(offerMap);
      } catch (error) {
        console.error("❌ Failed to load store offers:", error);
      }
    };
    fetchOffers();
  }, []);
  return (
    <Panel onClose={onClose} descriptionKey="1034" titleKey="1134" panelName="HowToGemsPanel">
      <div className="panel-content">

        <h2>{strings[9030]}</h2>
        <p>{strings[9031]}</p>
        <p>{strings[9032]}</p>

        <div className="standard-buttons" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '10px' }}>
        <p style={{ marginBottom: '0px', fontWeight: 'bold' }}>{strings[9040]}</p>
            <button className="btn-gold" style={{ width: '100%' }} onClick={() => handlePurchase(6, currentPlayer, updateStatus)}>{strings[9041]}{offers[6] ? ` $${offers[6].price.toFixed(2)}` : ''}</button>
        <p style={{ marginBottom: '0px', marginTop: '6px', fontWeight: 'bold' }}>{strings[9042]}</p>
            <button className="btn-gold" style={{ width: '100%' }} onClick={() => handlePurchase(7, currentPlayer, updateStatus)}>{strings[9043]}{offers[7] ? ` $${offers[7].price.toFixed(2)}` : ''}</button>
        <p style={{ marginBottom: '0px', marginTop: '6px', fontWeight: 'bold' }}>{strings[9044]}</p>
            <button className="btn-gold" style={{ width: '100%' }} onClick={() => handlePurchase(8, currentPlayer, updateStatus)}>{strings[9045]}{offers[8] ? ` $${offers[8].price.toFixed(2)}` : ''}</button>
        </div>

        <p>{strings[9033]}</p>


      </div>
    </Panel>
  );
});

export default HowToGemsPanel;
