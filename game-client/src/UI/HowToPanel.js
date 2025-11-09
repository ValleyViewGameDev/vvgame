import React, { memo } from 'react';
import Panel from './Panel'; // Importing the shared Panel component
import { useStrings } from './StringsContext';

const HowToPanel = memo(({ onClose }) => {
  const strings = useStrings();
  return (
    <Panel onClose={onClose} descriptionKey="1018" titleKey="1118" panelName="HowToPanel">
      <div className="panel-content">
        <h2>{strings[9001]}</h2>
        <p>{strings[9002]}</p>
        <p>{strings[9003]}</p>
        <h3>{strings[9004]}</h3>
        <p>{strings[9005]}</p>
        <p>{strings[9006]}</p>
        <p>{strings[9007]}</p>
        <h3>{strings[9008]}</h3>
        <p>{strings[9009]}</p>
        <p>{strings[9010]}</p>
        <p>{strings[9011]}</p>
        <h3>{strings[9012]}</h3>
        <p>{strings[9013]}</p>
        <p>{strings[9014]}</p>
      </div>
    </Panel>
  );
});

export default HowToPanel;
