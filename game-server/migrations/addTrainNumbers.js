// Migration script to add train numbers to existing train logs
const mongoose = require('mongoose');
const Settlement = require('../models/settlement');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function addTrainNumbers() {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const settlements = await Settlement.find({});
    console.log(`Found ${settlements.length} settlements to update`);

    for (const settlement of settlements) {
      if (!settlement.trainlog || settlement.trainlog.length === 0) {
        continue;
      }

      let trainNumber = 1;
      let updated = false;

      // Sort trainlog by date (oldest first)
      settlement.trainlog.sort((a, b) => new Date(a.date) - new Date(b.date));

      // Add train numbers to existing logs
      for (const log of settlement.trainlog) {
        if (!log.trainnumber) {
          log.trainnumber = trainNumber;
          updated = true;
        }
        trainNumber++;
      }

      // Set next train number
      if (!settlement.nextTrainNumber) {
        settlement.nextTrainNumber = trainNumber;
        updated = true;
      }

      if (updated) {
        await settlement.save();
        console.log(`Updated settlement ${settlement.name} with train numbers`);
      }
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the migration
addTrainNumbers();