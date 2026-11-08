import React, { memo } from 'react';
import Panel from './Panel'; // Importing the shared Panel component
import { useStrings } from '../StringsContext';
import { richText } from '../Icons/RichText';

const HowToMoneyPanel = memo(({ onClose }) => {

  const strings = useStrings();
  return (
    <Panel onClose={onClose} descriptionKey="1026" titleKey="1126" panelName="HowToMoneyPanel">
      <div className="panel-content">

        <h2 className="panel-subheading">{strings[9020]}</h2>
        <p>{richText(strings[9021])}</p>
        <p>{richText(strings[9022])}</p>
        <p>{richText(strings[9023])}</p>
        <p>{richText(strings[9024])}</p>
        <h2 className="panel-subheading">{strings[9025]}</h2>
        <p>{richText(strings[9026])}</p>
        <p>{richText(strings[9027])}</p>
      </div>
    </Panel>
  );
});

export default HowToMoneyPanel;
