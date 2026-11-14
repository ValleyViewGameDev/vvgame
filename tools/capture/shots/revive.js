// Preparation, not a shot for a video: when the player has fallen, take "Revive for N gems"
// (never "Accept Your Death", which empties the backpack), then teleport to a quiet grid.
// Only run this when the owner has said to spend the gems.
import { sleep, teleport, whereAmI } from './lib.js';

export default {
  folder: '_prep',
  async setup(page) {
    await page.waitForSelector('.homestead', { timeout: 60000 });
    await sleep(8000);
  },
  async run(page) {
    const buttons = await page.evaluate(() => [...document.querySelectorAll('.modal-overlay button, .modal-overlay [role=button]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()));
    console.log('dialog buttons:', JSON.stringify(buttons));
    const revive = page.locator('.modal-overlay button').filter({ hasText: /^\s*Revive for/ });
    if (!(await revive.count())) { console.log('no revive button: nothing done'); return; }
    await revive.first().click();
    // the game asks "Spend N Gems?" before any gem spend: answer its Yes (btn-success)
    const confirm = page.locator('.modal-overlay').filter({ hasText: /Spend .* Gems\?/ });
    await confirm.waitFor({ timeout: 10000 });
    console.log('confirm says:', (await confirm.innerText()).replace(/\s+/g, ' ').trim());
    await confirm.locator('button.btn-success').click();
    await sleep(4000);
    console.log('dialog still open:', await page.locator('.modal-overlay').filter({ hasText: 'You have fallen' }).count());
    const quiet = (await whereAmI(page)).region === "Titania's Bower";
    console.log('now', JSON.stringify(quiet ? await whereAmI(page) : await teleport(page, process.env.PLACE || 'Titania')));
    await sleep(3000);
  },
};
