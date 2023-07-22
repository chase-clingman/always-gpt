import {
  app,
  BrowserWindow,
  nativeTheme,
  globalShortcut,
  screen,
  ipcMain,
} from "electron";
import { initialize, enable } from "@electron/remote/main";
import path from "path";
import os from "os";

// needed in case process is undefined under Linux
const platform = process.platform || os.platform();

try {
  if (platform === "win32" && nativeTheme.shouldUseDarkColors === true) {
    require("fs").unlinkSync(
      path.join(app.getPath("userData"), "DevTools Extensions")
    );
  }
} catch (_) {}

let mainWindow;

function createWindow() {
  /**
   * Initial window options
   */
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    icon: path.resolve(__dirname, "icons/icon.png"), // tray icon
    width: 340,
    height: 500,
    useContentSize: true,
    frame: false,
    // alwaysOnTop: true, // keep window always on top
    x: width - 350, // set initial x position (left)
    y: height - 510, // set initial y position (bottom)
    webPreferences: {
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD),
      contextIsolation: true,
      sandbox: false,
    },
  });

  enable(mainWindow.webContents);

  // mainWindow.on("focus", () => mainWindow.setOpacity(1)); // Set opacity to 1 when window is focused
  // mainWindow.on("blur", () => mainWindow.setOpacity(0.5)); // Set opacity to 0.5 when window loses focus
  mainWindow.loadURL(process.env.APP_URL);
  // ipcMain.on("mouse-over", () => {
  //   mainWindow.setOpacity(1);
  // });

  // ipcMain.on("mouse-leave", () => {
  //   mainWindow.setOpacity(0.4);
  // });

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools();
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Add this block to expose the minimize function to your renderer process
initialize();
app.whenReady().then(() => {
  global.mainWindow = mainWindow;

  ipcMain.handle("minimize", () => {
    mainWindow.minimize();
  });

  // Add this block to expose the closeApp function to your renderer process
  ipcMain.handle("close", () => {
    mainWindow.close();
  });

  // Start the Node.js server as a child process.
  const server = spawn("node", [`${__dirname}/server/app.js`], {
    stdio: "inherit", // this line is important to see any server logs in the electron logs
  });

  server.on("error", (error) => {
    console.error(`Failed to start server: ${error}`);
  });

  server.on("exit", (code, signal) => {
    if (code !== 0) {
      console.error(`Server process exited with code ${code}`);
    }
  });
});

app.whenReady().then(() => {
  createWindow();
  // Register a 'Control+Space' shortcut listener.
  const ret = globalShortcut.register("Control+B", () => {
    mainWindow.focus();
    // Execute a JavaScript function in the renderer process that emits a 'processAudio' event.
    mainWindow.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('processAudio'));
    `);
  });

  if (!ret) {
    console.log("registration failed");
  }

  const focus = globalShortcut.register("Control+Space", () => {
    mainWindow.focus();
    mainWindow.webContents.send("shortcutFired");
  });

  if (!focus) {
    console.log("registration failed");
  }

  console.log(globalShortcut.isRegistered("Control+Space+V"));
  // Check whether 'Control+Space' is registered.
  console.log(globalShortcut.isRegistered("Control+Space"));
});

app.on("will-quit", () => {
  // Unregister all shortcuts.
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
