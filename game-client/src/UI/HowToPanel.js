import React, { memo } from 'react';
import Panel from './Panel'; // Importing the shared Panel component

const HowToPanel = memo(({ onClose }) => {
  return (
    <Panel onClose={onClose} descriptionKey="1018" titleKey="1118" panelName="HowToPanel">
      <div className="panel-content">
        <p>Welcome to Valley View!</p>

        <h2>What’s it about? </h2>
        <p>
          Valley view is a game that explores how people might self organize and create micro societies in a world
          of asymmetric resources and interdependence, with both owned and shared spaces.
        </p>
        <p>
          While there are no explicit specialization paths, there are three main vectors of play which are
          interdependent. These are: the <strong>Farmer</strong>, the <strong>Adventurer</strong>, and the{' '}
          <strong>Politician</strong>. You are encouraged to lean upon each other.
        </p>
        <h3>First, the basics:</h3>
        <p>
          Use A-W-S-D keys to <strong>Move</strong>. Click to interact with things that are within your interaction
          radius.
        </p>
        <p>
          Explore <strong>Farming</strong>, <strong>Build</strong>, and <strong>Buy</strong> to improve your Homestead
          and generate resources.
        </p>
        <p>
          Generate <strong>Money</strong> at the <strong>Trade Stall</strong>. Post resources for sale to other players,
          or sell them to the game for partial value.
        </p>
        <h3>More:</h3>
        <p>
          As you create wealth, improve yourself with <strong>Skills</strong> and <strong>Upgrades</strong>. For example,
          purchase a <strong>Horse Skill</strong> to travel to <strong>Town</strong>.
        </p>
        <p>
          Zoom out <strong>(- and +)</strong> to see how big the world is. Your Homestead is one of many in a{' '}
          <strong>Settlement</strong>. Each Settlement has a shared Town. Your Settlement is one of many in the{' '}
          <strong>Frontier</strong>.
        </p>
        <p>
          When you are ready, explore the <strong>Valley</strong>, which is full of danger and wonder. A single{' '}
          <strong>Wizard</strong> can be found in the Valley for the entire Frontier.
        </p>
        <h3>Your Goals:</h3>
        <p>
          Feel free to create your own goals. Also, at the end of each <strong>Season</strong>, which runs three months,
          both individuals and settlements will be ranked, and top placement generates additional wealth. Some of your
          wealth will carry over into the next Season.
        </p>
        <p>Farm, craft, trade, explore, fight, and enjoy!</p>
      </div>
    </Panel>
  );
});

export default HowToPanel;
