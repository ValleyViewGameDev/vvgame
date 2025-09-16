import React, { memo } from 'react';
import Panel from './Panel'; // Importing the shared Panel component
import { useStrings } from './StringsContext';

const HowToGemsPanel = memo(({ onClose }) => {

  const strings = useStrings();
  return (
    <Panel onClose={onClose} descriptionKey="1034" titleKey="1134" panelName="HowToGemsPanel">
      <div className="panel-content">

        <h2>{strings[9030]}</h2>
        <p>{strings[9031]}</p>
        <p>{strings[9032]}</p>
        <p>{strings[9033]}</p>


      </div>
    </Panel>
  );
});

export default HowToGemsPanel;
