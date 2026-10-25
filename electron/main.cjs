const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const { APP_URL, isAppUrl, isExternalUrl } = require('./policy.cjs');
const brand = require('./brand.json');

app.setName(brand.name);
app.setAppUserModelId('store.flowa.desktop');
let window;

function openExternal(url) {
  if (isExternalUrl(url)) void shell.openExternal(url).catch(() => {});
}

function createWindow() {
  window = new BrowserWindow({
    title: brand.name,
    width: 1360, height: 900, minWidth: 960, minHeight: 640,
    backgroundColor: '#0B0B0B', icon: path.join(__dirname, 'icon.ico'),
    show: false,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      partition: 'persist:flowa',
    },
  });
  window.once('ready-to-show', () => window.show());
  const session = window.webContents.session;
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) void window.loadURL(url).catch(() => {});
    else openExternal(url);
    return { action: 'deny' };
  });
  for (const eventName of ['will-navigate', 'will-redirect']) {
    window.webContents.on(eventName, (event, url) => {
      if (isAppUrl(url)) return;
      event.preventDefault();
      openExternal(url);
    });
  }
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (code === -3 || !isMainFrame || !isAppUrl(url)) return;
    void window.loadFile(path.join(__dirname, 'offline.html')).catch(() => {});
    window.show();
  });
  window.on('closed', () => { window = undefined; });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: brand.name, submenu: [
      { label: 'Abrir FLOWA', click: () => { if (window) void window.loadURL(APP_URL).catch(() => {}); } },
      { label: 'Abrir no navegador', click: () => { void shell.openExternal(APP_URL).catch(() => {}); } },
      { type: 'separator' }, { role: 'quit', label: 'Sair' },
    ] },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Visualizar', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'resetZoom', label: 'Zoom original' }, { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' }, { role: 'togglefullscreen', label: 'Tela cheia' }] },
  ]));
  void window.loadURL(APP_URL).catch(() => {});
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(createWindow);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}