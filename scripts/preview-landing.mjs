import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    useContentSize: true,
    show: false,
    backgroundColor: '#031C45',
  })
  win.setContentSize(1440, 900)
  await win.loadFile(path.join(root, 'docs', 'index.html'))
  await win.webContents.executeJavaScript('document.fonts.ready')
  await new Promise((r) => setTimeout(r, 1200))
  const hero = await win.capturePage()
  fs.writeFileSync(path.join(root, 'docs', 'shots', '_preview-hero.png'), hero.toPNG())
  await win.webContents.executeJavaScript('window.scrollTo(0, document.getElementById("product").offsetTop - 80)')
  await new Promise((r) => setTimeout(r, 500))
  const product = await win.capturePage()
  fs.writeFileSync(path.join(root, 'docs', 'shots', '_preview-product.png'), product.toPNG())
  await win.webContents.executeJavaScript('window.scrollTo(0, document.getElementById("billing").offsetTop - 80)')
  await new Promise((r) => setTimeout(r, 400))
  const billing = await win.capturePage()
  fs.writeFileSync(path.join(root, 'docs', 'shots', '_preview-billing.png'), billing.toPNG())
  const info = await win.webContents.executeJavaScript(
    '({ sh: document.documentElement.scrollHeight, ih: window.innerHeight, y: window.scrollY })',
  )
  console.log('page', info)
  app.quit()
})
