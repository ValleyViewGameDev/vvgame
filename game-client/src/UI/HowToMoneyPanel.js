import React, { memo } from 'react';
import Panel from './Panel'; // Importing the shared Panel component
import { useStrings } from './StringsContext';

const HowToMoneyPanel = memo(({ onClose }) => {

  const strings = useStrings();
  return (
    <Panel onClose={onClose} descriptionKey="1026" titleKey="1126" panelName="HowToMoneyPanel">
      <div className="panel-content">

        <h2>{strings[9020]}</h2>
        <p>{strings[9021]}</p>
        <p>{strings[9022]}</p>
        <p>{strings[9023]}</p>
        <p>{strings[9024]}</p>
        <h2>{strings[9025]}</h2>
        <p>{strings[9026]}</p>
        <p>{strings[9027]}</p>


      </div>
    </Panel>
  );
});

export default HowToMoneyPanel;
