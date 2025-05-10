const path = require('path');
const { app, BrowserWindow } = require('electron');
const isDev = !app.isPackaged;

const projectRoot = isDev
  ? path.join(__dirname, '..')
  : path.join(app.getAppPath(), '..', '..', '..'); // outside the .app package


// 🔧 Initialize remote support
require('@electron/remote/main').initialize();

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // ✅ Enable remote after window is created
  require('@electron/remote/main').enable(win.webContents);

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, 'dist-build', 'index.html')}`;

  win.loadURL(startUrl);
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);