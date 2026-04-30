# Hikvision connector (PunchPay)

Pulls access events from a Hikvision terminal over **LAN (ISAPI / digest auth)** and pushes to `https://punchpay.in/api/device/push` (same as ZK connector API).

Digest auth is implemented in **`digestHttpJsonPost.js`** (plain Node `http`/`https` + MD5) so the Windows **`.exe` built with `pkg` works** — we do not use `digest-fetch` (ESM) because it breaks inside `pkg` with `ERR_REQUIRE_ESM`.

This folder is self-contained: **build and ship separately** from the ZK connector in `connector/` (parent).

## Build `.exe` (Windows)

On a Windows machine (or CI with Windows):

```bat
cd connector\hikvision
npm install
npm run build:win
```

Output: **`dist\connector-hik.exe`**

Copy to client folder:

- `dist\connector-hik.exe` → rename/move so client has `connector-hik.exe` in their folder **or** keep `dist\connector-hik.exe` and run `install-windows.bat` from the same tree (installer checks both).

## Build Mac binary

```bash
cd connector/hikvision
npm install
npm run build:mac
```

Output: `dist/connector-hik-mac`

## Client zip (same idea as ZK)

Give the client:

1. `connector-hik.exe` (from `dist/` after build)
2. `config.example.hikvision.json`
3. `install-windows.bat`
4. `run-windows.bat` (optional watchdog)
5. `start-connector.bat` (optional double-click start)
6. **`run-once-debug.bat`** — use this first on Windows: keeps the window open and shows errors (double-clicking the `.exe` alone often closes the console immediately).

**Windows:** `config.hikvision.json` must sit in the **same folder as `connector-hik.exe`**. If the exe lives in `dist\`, put the config in `dist\` too, or copy the exe up one level into the client folder with the config.

Client renames `config.example.hikvision.json` → **`config.hikvision.json`**, fills values, then **Run as administrator** → `install-windows.bat`.

- Log: `connector-hik.log`
- State: `hikvision.state.json`
- Task Scheduler name: **`AttendanceConnectorHik`** (different from ZK `AttendanceConnector`)

## Dev / one-shot test

```bash
cd connector/hikvision
npm install
cp config.example.hikvision.json config.hikvision.json
# edit config.hikvision.json
node hikvision-connector.js --once
```

## Mac auto-start

```bash
chmod +x install-mac.sh
./install-mac.sh
```

## Troubleshooting: `403` / `notSupport` on `AcsEvent`

Many **DS-K1T** terminals reject `major: 0` for event search. Use **`majorCode`: `5`** (default in code and in `config.example.hikvision.json`).  
Optional **`eventAttribute`: `"attendance"`** helps some firmware; remove that key if you get “Invalid Content”.  
For only authenticated punches, try **`minorCode`: `75`**.
