# Bizora

Professional offline-first desktop billing software for small and medium businesses.

## Develop

```bash
npm install
npm run dev
```

## Build Windows installer

```bash
npm run dist:win
```

Installer output: `release/Bizora-Setup-1.0.0.exe`

### Microsoft Windows compliance

| Area | Behavior |
| --- | --- |
| Elevation | Runs as normal user (`asInvoker`) |
| User data | `%APPDATA%\bizora\` (not Program Files) |
| Identity | AppUserModelID `com.bizora.app` |
| Shortcuts | Start Menu + desktop |
| Uninstall | Settings → Apps; business data kept by default |
| License | EULA during install |
| Single instance | Focuses existing window |
| External links | Only http/https/mailto |
| Signing | SHA-256 Authenticode ready |

### Code signing (SmartScreen)

```bash
set CSC_LINK=C:\certs\bizora-codesign.pfx
set CSC_KEY_PASSWORD=********
npm run dist:win
```

## First run

1. Create a company workspace
2. Add products and customers
3. Create your first invoice from **New Sale**
