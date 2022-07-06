import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { release } from 'os';
import { join } from 'path';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';

// Log file location:
//  Windows: %USERPROFILE%\AppData\Roaming\{app name}\logs\{process type}.log
//  levels: error, warn, info, verbose, debug, silly... Set false to disable logging.
log.transports.file.level = 'info';
log.info(`App v${app.getVersion()} starting...`);

autoUpdater.logger = log;

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

export const ROOT_PATH = {
  // /dist
  dist: join(__dirname, '../..'),
  // /dist or /public
  public: join(__dirname, app.isPackaged ? '../..' : '../../../public'),
};

let win: BrowserWindow | null = null;
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js');
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin
const url = `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}`;
const indexHtml = join(ROOT_PATH.dist, 'index.html');

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: join(ROOT_PATH.public, 'favicon.ico'),
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (app.isPackaged) {
    win.loadFile(indexHtml);
  } else {
    win.loadURL(url);
    // win.webContents.openDevTools()
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  if (app.isPackaged) {
    checkForUpdates();
  }
});

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// new window example arg: new windows url
ipcMain.handle('open-win', (event, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
    },
  });

  if (app.isPackaged) {
    childWindow.loadFile(indexHtml, { hash: arg });
  } else {
    childWindow.loadURL(`${url}/#${arg}`);
    // childWindow.webContents.openDevTools({ mode: "undocked", activate: true })
  }
});

function checkForUpdates() {
  log.info('Set up event listeners...');
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });
  autoUpdater.on('update-available', (info) => {
    log.info('Update available.');
  });
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
  });
  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater.' + err);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    let msg = 'Download speed: ' + progressObj.bytesPerSecond;
    msg = msg + ' - Downloaded ' + progressObj.percent + '%';
    msg = msg + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
    log.info(msg);
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded.');

    // The update will automatically be installed the next time the
    // app launches. If you want to, you can force the installation
    // now:
    const dialogOpts = {
      type: 'info',
      buttons: ['Restart', 'Later'],
      title: 'App Update',
      message: info.releaseName || 'releaseName',
      detail: `A new version (${info.version}) has been downloaded. Restart the application to apply the updates.`,
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) autoUpdater.quitAndInstall();
    });
  });

  // More properties on autoUpdater, see https://www.electron.build/auto-update#AppUpdater
  //autoUpdater.autoDownload = true
  //autoUpdater.autoInstallOnAppQuit = true

  // No debugging! Check main.log for details.
  // Ready? Go!
  log.info('checkForUpdates() -- begin');
  try {
    //autoUpdater.setFeedURL('')
    autoUpdater.checkForUpdates();
    //autoUpdater.checkForUpdatesAndNotify()
  } catch (error) {
    log.error(error);
  }
  log.info('checkForUpdates() -- end');
}
