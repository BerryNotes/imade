const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

const isDev = !fs.existsSync(path.join(__dirname, "dist-client", "index.html"));

app.whenReady().then(() => {
  // Store user data (songs, uploads, backups) in a writable location
  process.env.APP_DATA_PATH = app.getPath("userData");
  process.env.PORT = "3456";
  process.env.IMADE_MODE = "electron";

  const { startServer } = require("./server");

  startServer((port) => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      title: "iMade",
      icon: path.join(__dirname, "build", "icon.png"),
      frame: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    if (isDev) {
      // Dev mode: load from Vite dev server
      mainWindow.loadURL("http://localhost:5173");
    } else {
      // Production: load from Express (which serves dist-client/)
      mainWindow.loadURL(`http://localhost:${port}`);
    }
    mainWindow.on("closed", () => (mainWindow = null));
  });
});

// Window control IPC handlers
ipcMain.on("window-minimize", () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on("window-close", () => { if (mainWindow) mainWindow.close(); });

app.on("window-all-closed", () => app.quit());
