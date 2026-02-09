const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

const isDev = !fs.existsSync(path.join(__dirname, "dist-client", "index.html"));

app.whenReady().then(() => {
  // Store user data (songs, uploads, backups) in a writable location
  process.env.APP_DATA_PATH = app.getPath("userData");
  process.env.PORT = "3456";

  const { startServer } = require("./server");

  startServer((port) => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      title: "iMade",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
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

app.on("window-all-closed", () => app.quit());
