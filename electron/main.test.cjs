const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
test('desktop sandbox, navigation, failure recovery and permissions are enforced', async () => {
  let window, options; const external = [];
  class Window extends EventEmitter {
    constructor(value) {
      super(); options = value; window = this; this.loaded = [];
      this.webContents = new EventEmitter();
      this.webContents.session = {
        setPermissionRequestHandler: (fn) => { this.permission = fn; },
        setPermissionCheckHandler: (fn) => { this.checkPermission = fn; },
      };
      this.webContents.setWindowOpenHandler = (fn) => { this.popup = fn; };
    }
    loadURL(url) { this.loaded.push(url); return Promise.resolve(); }
    loadFile(file) { this.file = file; return Promise.resolve(); }
    show() {}
    static getAllWindows() { return [window]; }
  }
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, setAppUserModelId() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {} });
  const electron = { app, BrowserWindow: Window, Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} }, shell: { openExternal: (url) => { external.push(url); return Promise.resolve(); } } };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/main.cjs`, 'utf8'), {
    require: (id) => id === 'electron' ? electron : id === './brand.json' ? { name: 'FLOWA' } : require(id),
    __dirname, process: { platform: 'win32' },
  });
  await Promise.resolve();
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.partition, 'persist:flowa');
  assert.deepEqual(window.loaded, ['https://flowa.store']);
  let allowed; window.permission(null, 'media', (value) => { allowed = value; });
  assert.equal(allowed, false); assert.equal(window.checkPermission(), false);
  let prevented = false;
  window.webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://accounts.google.com');
  assert.equal(prevented, true); assert.deepEqual(external, ['https://accounts.google.com']);
  window.popup({ url: 'file:///private' }); assert.equal(external.length, 1);
  assert.equal(window.popup({ url: 'https://flowa.store/app/dashboard' }).action, 'deny');
  assert.equal(window.loaded.at(-1), 'https://flowa.store/app/dashboard');
  window.webContents.emit('did-fail-load', {}, -105, '', 'https://flowa.store', true);
  assert.equal(window.file, require('node:path').join(__dirname, 'offline.html'));
});