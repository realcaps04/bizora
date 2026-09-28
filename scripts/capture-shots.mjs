import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'docs', 'shots')
const screens = ['dashboard', 'invoices', 'sale', 'products', 'customers', 'reports']

app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    backgroundColor: '#f3f4f6',
    webPreferences: {
      sandbox: true,
    },
  })
  win.setContentSize(1600, 960)
  await win.loadFile(path.join(root, 'scripts', 'marketing-shots.html'))
  await win.webContents.executeJavaScript('document.fonts.ready')
  await new Promise((r) => setTimeout(r, 600))
  for (const name of screens) {
    await win.webContents.executeJavaScript(`window.showScreen(${JSON.stringify(name)})`)
    await new Promise((r) => setTimeout(r, 250))
    const image = await win.capturePage()
    fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG())
    console.log('wrote', name, image.getSize())
  }
  app.quit()
})
