import React, { memo } from 'react';
import Panel from './Panel'; // Importing the shared Panel component

const HowToMoneyPanel = memo(({ onClose }) => {
  return (
    <Panel onClose={onClose} descriptionKey="1026" titleKey="1126" panelName="HowToMoneyPanel">
      <div className="panel-content">

        <h2>How to Earn Money</h2>
        <p>There are a few ways to make Money.</p>
        <p>As you are getting started, open the <strong>🏠 Trade Stall</strong>, which you will find in the upper left corner of your Homestead. Here, you can sell goods, including crops and crafts.</p>
        <p>The <strong>🏠 Trade Stall</strong> will buy goods from you at 50% of their value. To maximize your earnings, you should trade with other players. They will have things you need, and vice versa.</p>
        <p>As you advance, you'll be able to travel into  <strong>Town</strong> using the  <strong>⏪ Signpost</strong>. There, you will find places like the Bank, which will buy specific items from you at a premium.</p>

        <h2>Spending Money</h2>
        <p>Surprise, most things cost money. Initially, you will want to spend money on <strong>⚙️ Skills</strong>, <strong>🐮 Farm Animals</strong>, and <strong>⚒️ Crafting Stations</strong>. Explore the panels at the left side of the screen. These will help you generate more resources, which in turn will help you earn more Money.</p>
        <p>In <strong>Town</strong> you will disocver more Shops and Traders.</p>


      </div>
    </Panel>
  );
});

export default HowToMoneyPanel;
