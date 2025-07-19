require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

console.log("🔑 OpenAI key:", process.env.OPENAI_API_KEY?.slice(0, 8) + '...');

const args = process.argv.slice(2);
const targetLang = args[0];

if (!targetLang) {
  console.error('❌ Please provide a target language code, e.g., "es" for Spanish.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const inputPath = path.join('game-client', 'src', 'UI', 'Strings', 'stringsEN.json');
const outputPath = path.join('game-client', 'src', 'UI', 'Strings', `strings${targetLang.toUpperCase()}.json`);

async function translateAllStrings() {
  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const strings = JSON.parse(rawData);

  const keys = Object.keys(strings);
  const values = Object.values(strings);

  console.log(`🌍 Translating ${keys.length} strings to "${targetLang}"...`);

  const chunks = [];
  const chunkSize = 50;

  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following array of English UI strings to ${targetLang} and return a JSON array of the same length in the same order.`,
        },
        {
          role: 'user',
          content: JSON.stringify(chunk),
        },
      ],
    });

    const raw = response.choices[0].message.content;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const translatedChunk = JSON.parse(cleaned);
    chunks.push(...translatedChunk);
  }

  const result = {};
  keys.forEach((key, index) => {
    result[key] = chunks[index];
  });

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`✅ Translation saved to ${outputPath}`);
}

translateAllStrings().catch((err) => {
  console.error('❌ Error during translation:', err);
});