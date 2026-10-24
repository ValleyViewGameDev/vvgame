/**
 * What a quest is CALLED on screen, when that differs from its persisted id. A quest's `title` is
 * the id stored on every player's activeQuests / completedQuests, so it never changes in place
 * (CLAUDE.md); the narrative pass (docs/narrative-pass.md, owner 2026-10-24) gives the old Valley
 * View titles Shakespearean names here instead. English only, like the titles themselves.
 * Source of each line in the comment beside it.
 */
export const QUEST_DISPLAY_TITLES = {
  // The Shepherd: the homestead
  'Plant Wheat': 'The Seeds of Time',                          // Macbeth 1.3
  'Grower': 'Which Grain Will Grow',                           // Macbeth 1.3
  "Earth's Bounty": 'Barns and Garners Never Empty',           // The Tempest 4.1 (Ceres)
  'Wood Master': 'Many Strokes, a Little Axe',                 // Henry VI Part 3, 2.1
  'The Gentle Art': 'The Edge of Husbandry',                   // Hamlet 1.3
  'Bovine Bliss': 'The Milk of Human Kindness',                // Macbeth 1.5
  'Cream of the Crop': 'She Can Milk',                         // The Two Gentlemen of Verona 3.1 (Launce)
  'Backpack': 'Jog On, the Footpath Way',                      // The Winter's Tale 4.3 (Autolycus)
  'Foundations of Stone': 'This Castle Hath a Pleasant Seat',  // Macbeth 1.6
  'Fleecy Fellowship': 'To See My Ewes Graze',                 // As You Like It 3.2 (Corin)
  'Mill by Moonlight': 'Well Met by Moonlight',                // after "Ill met by moonlight", the Dream 2.1
  'Sweet Harvest': 'If Sack and Sugar Be a Fault',             // Henry IV Part 1, 2.4 (Falstaff)
  'Hire Farm Hand': 'Come Apace, Good Audrey',                 // As You Like It 3.3
  'Master Mason': 'O Sweet, O Lovely Wall',                    // the Dream 5.1
  "Cook's Harvest": "Earth's Increase",                        // The Tempest 4.1 (Ceres)
  'Hire Rancher': 'I Am a True Labourer',                      // As You Like It 3.2 (Corin)
  'Mechanics': 'Rude Mechanicals',                             // the Dream 3.2 (Puck)
  'Coop Dreams': 'The Trumpet to the Morn',                    // Hamlet 1.1 (the cock)
  'The Spark Within': 'Promethean Heat',                       // Othello 5.2
  'Hire Lumberjack': 'Is All Our Company Here?',               // the Dream 1.2 (Quince)
  'Lumber Yard': 'Hew Down and Fell',                          // Henry VI Part 3, 2.1
  'Nectar of the Valley': 'Good Wine Needs No Bush',           // As You Like It, epilogue
  // Mistress Quickly: the kitchen
  'Dairy to Dream': "Adversity's Sweet Milk",                  // Romeo and Juliet 3.3
  'Cheddar Ambitions': 'Cheese and Garlic in a Windmill',      // Henry IV Part 1, 3.1 (Hotspur)
  'Dairy Delights': 'As Subject to Heat as Butter',            // The Merry Wives 3.5 (Falstaff)
  'Hearth of the Matter': 'Fire Burn and Oven Bake',           // after Macbeth 4.1
  'Yeast of Burden': 'A Halfpennyworth of Bread',              // Henry IV Part 1, 2.4
  "Baker's Bible": "The Baker's Daughter",                     // Hamlet 4.5 (Ophelia)
  'Pie for the Sky': 'Funeral Baked Meats',                    // Hamlet 1.2
  'Sweet Words, Soft Crumbs': 'Cakes and Ale',                 // Twelfth Night 2.3
  'Kitchen Confidential': 'A Kitchen for Mistress Quickly',
  'Omelette, Sweet Omelette': 'Even for an Eggshell',          // Hamlet 4.4
  "The Cook's Flame": "'Tis an Ill Cook",                      // Romeo and Juliet 4.2
  'Banquet of Fools': 'Good Digestion Wait on Appetite',       // Macbeth 3.4
  'Royal Tea': 'A Dish Fit for the Gods',                      // Julius Caesar 2.1
  // Feste: crafting
  'Threads of Destiny': 'The Web of Our Life',                 // All's Well That Ends Well 4.3
  'Spun and Done': 'A Mingled Yarn',                           // All's Well That Ends Well 4.3
  'A Thread Most Fine': 'Bottom the Weaver',                   // the Dream
  'Art for Artistry’s Sake': 'The Mirror Up to Nature',        // Hamlet 3.2
  'A Room of One’s Art': 'To Paint the Lily',                  // King John 4.2
  'Throwing Shade': 'Turned to Clay',                          // Hamlet 5.1
  'The Fine Cut': 'Apparel Oft Proclaims the Man',             // Hamlet 1.3
  'Ashes to Art': 'Golden Lads and Girls',                     // Cymbeline 4.2 (the song)
  // Helena: the wild
  'Mushroom Mystery': 'Midnight Mushrooms',                    // The Tempest 5.1
  'Tulip Mania': "Here's Flowers for You",                     // The Winter's Tale 4.4 (Perdita)
  'Where Honey Dwells': 'Where the Bee Sucks',                 // The Tempest 5.1 (the song)
  // Hotspur: the hunt
  'Focus the Hunt': "The Game's Afoot",                        // Henry V 3.1
  'Hide Like Iron': 'Stiffen the Sinews',                      // Henry V 3.1
  'Pelts for Pain': "A Coat for Snug's Lion",                  // the Dream (Snug buys pelts)
  // Portia: the Town
  'Let School Begin': 'Unwillingly to School',                 // As You Like It 2.7
  'Stacks of Power': 'Dukedom Large Enough',                   // The Tempest 1.2 (Prospero's library)
  // The Vampire
  'Zombies, die': 'The Graves Stood Tenantless',               // Hamlet 1.1
};

export const questDisplayTitle = (title) => QUEST_DISPLAY_TITLES[title] || title;
