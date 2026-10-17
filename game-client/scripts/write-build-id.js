#!/usr/bin/env node
/**
 * After `react-scripts build`: write build/build.json = { build: <commit> }, the client deploy's
 * id. The running app (Utils/buildWatch.js) polls it to notice that a NEWER client was deployed
 * than the one it is running, and offers a refresh (UI/Modals/UpdatePrompt.js). Render sets
 * RENDER_GIT_COMMIT during the build; locally it is 'dev' and the check stays off.
 */
const fs = require('fs');
const path = require('path');
const build = process.env.RENDER_GIT_COMMIT || 'dev';
fs.writeFileSync(path.join(__dirname, '..', 'build', 'build.json'), JSON.stringify({ build }) + '\n');
console.log(`build.json: ${build}`);
