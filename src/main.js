"use strict";

const path = require("node:path");
const {
  app,
  BrowserWindow,
  shell,
} = require("electron");
const { Database } = require("./database");
const { startLocalServer } = require("./server");

const APP_NAME = "秋招进度台";
const WINDOW_WIDTH = 430;
const WINDOW_HEIGHT = 720;

let database;
let localServer;
let mainWindow;

app.setName(APP_NAME);
app.setAppUserModelId("com.kk.autumnhiretracker.windows");
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "AutumnHireTracker-Windows"),
);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    useContentSize: true,
    minWidth: 430,
    minHeight: 640,
    show: false,
    frame: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    roundedCorners: true,
    backgroundColor: "#f4f0e8",
    icon: path.join(__dirname, "..", "assets", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadURL(`${localServer.baseUrl}/widget`);
  mainWindow.once("ready-to-show", () => {
    showMainWindow();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(localServer.baseUrl)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localServer.baseUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

async function initialize() {
  const databasePath = path.join(app.getPath("userData"), "autumn_hire.db");
  database = await Database.open(databasePath);
  localServer = await startLocalServer({
    database,
    webRoot: path.join(__dirname, "..", "web"),
  });
  createMainWindow();
}

app.whenReady().then(initialize).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("second-instance", () => {
  if (app.isReady()) showMainWindow();
});

app.on("before-quit", () => {
  localServer?.server.close();
  database?.close();
});

app.on("window-all-closed", () => {
  app.quit();
});
