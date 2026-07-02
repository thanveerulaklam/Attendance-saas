# Matrix COSEC Connector (PunchPay)

Standalone folder — copy this entire **`matrix`** directory to the client PC.

**Not for ZKTeco/eSSL.** Do not use the parent `connector/` ZK package on Matrix devices.

Full guide: [Docs/MATRIX_COSEC_SETUP.md](../../Docs/MATRIX_COSEC_SETUP.md)

---

## Folder contents

| File | Purpose |
|------|---------|
| `cosec-connector.js` | Connector source (Node.js) |
| `config.example.cosec.json` | Config template → rename to `config.cosec.json` |
| `connector-cosec.exe` / `connector-cosec-mac` | After build, in `dist/` |
| `install-windows.bat` / `install-mac.sh` | Auto-start on boot |
| `run-windows.bat` | Manual run with auto-restart |
| `SETUP_GUIDE.txt` | Client step-by-step |

---

## Build (on your machine)

```bash
cd connector/matrix
npm install
npm run build:win    # → dist/connector-cosec.exe
npm run build:mac    # → dist/connector-cosec-mac
```

---

## Client zip checklist

Copy to client PC (e.g. `C:\MatrixConnector\`):

1. `dist/connector-cosec.exe` (or mac binary)
2. `config.example.cosec.json` → client renames to `config.cosec.json`
3. `install-windows.bat` (Windows) or `install-mac.sh` (Mac)
4. `SETUP_GUIDE.txt`

---

## Quick commands

**Before configuring PunchPay** (no API key needed — only device IP + COSEC login):

```bash
# Copy probe template (no deviceApiKey required)
cp config.example.probe.json config.cosec.json

npm run probe      # quick: device reachability + sample mapping
npm run dry-run    # full batch + PunchPay format validation + dry-run-preview.json
```

With API key (live sync):

```bash
npm run once     # one sync to PunchPay
npm start        # continuous polling
```

Or with the exe:

```bash
connector-cosec.exe --probe
connector-cosec.exe --dry-run
connector-cosec.exe --once
```

Logs: `connector-cosec.log` · State: `cosec.state.json`
