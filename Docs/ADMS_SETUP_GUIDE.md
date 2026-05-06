# eSSL / ZKTeco ADMS - Setup guide (no connector)

Use this when the device has **Cloud Server Setting** with **Server Mode: ADMS** and only server address/domain fields.

PunchPay identifies the device by **serial number (SN)** saved in the app. You do not need to type a long API key on the device keypad for this mode.

---

## What to configure

| Item | Value |
|------|-------|
| App mapping | Device card `ADMS serial (SN)` = device serial |
| Device cloud mode | `ADMS` |
| Device server | `punchpay.in` |

---

## 1) PunchPay (admin / HR)

1. Open **Devices** → register or select the machine.
2. Set **Branch** correctly (punches are validated against that branch).
3. Enter **ADMS serial (SN)** exactly as on the device sticker or system info (e.g. `JNP2254200039`). Click **Save**.
4. Cloud token is for webhook mode only; ADMS mode does not require token entry on this menu.

---

## 2) Device — Ethernet

`Communication` → `Ethernet` (or wired network):

- IP address: use a free IP in the client LAN (example `192.168.1.205`)
- Subnet mask: usually `255.255.255.0`
- Gateway: client router IP (example `192.168.1.1`)
- DNS: `8.8.8.8` (primary), `1.1.1.1` (secondary) or router DNS
- DHCP: OFF if static IP is set (or ON for quick conflict-free testing)
- Save and reboot device once.

---

## 3) Device — Cloud Server Setting

`Communication` → `Cloud Server Setting` (names may vary slightly):

- **Server Mode:** `ADMS`
- **Enable Domain Name:** `ON`
- **Server Address:** `punchpay.in` (or your API hostname)
- **Enable Proxy Server:** `OFF`

Save and reboot the device once.

---

## 4) Quick verification

**From the VPS:**

```bash
curl -i "http://127.0.0.1:3000/iclock/getrequest?SN=TEST123"
curl -i "https://YOUR_DOMAIN/iclock/getrequest?SN=TEST123"
```

Expect **`200`** and plain body **`OK`** (not HTML).

**Live traffic (during a punch or device poll):**

```bash
tail -f /var/log/nginx/access.log | grep -i iclock
```

Healthy patterns:

- `POST .../iclock/cdata.aspx?...table=ATTLOG...` → **200**
- `GET .../iclock/getrequest.aspx?...` → **200**

**In PunchPay:** device **Last sync** updates; **Attendance** shows new rows when employee codes match.

---

## 5) Employee codes

Device user ID / PIN must match **`employee_code`** in PunchPay for that branch. Unknown codes may be skipped; fix mapping in Employees, then wait for the next sync or trigger another punch.

---

## 6) Troubleshooting

| Symptom | Likely cause | What to check |
|---------|----------------|---------------|
| No `/iclock` lines in Nginx logs | DNS, gateway, or ADMS not saved | Ethernet DNS/gateway; save cloud settings; reboot device |
| `/iclock/...` returns HTML (SPA) | Server routing issue | Contact PunchPay tech team to verify ADMS routing |
| `404` on `cdata.aspx` | Old backend release | Deploy latest backend |
| 200 on `ATTLOG` but no punches | Wrong SN or wrong employee codes | **`adms_sn`** in app = device SN; match `employee_code` |
| Domain fails, IP works | DNS on device/LAN | Fix DNS or use IP temporarily for diagnosis |

**Serial number** is often on the device **rear label** (`SN:`) if it is not on the Communication menu.

---

## 7) Field checklist (short)

- [ ] Device registered in PunchPay with correct branch  
- [ ] **ADMS serial (SN)** saved and matches sticker  
- [ ] Ethernet: IP, gateway, DNS OK  
- [ ] Cloud: ADMS ON, domain ON, server `punchpay.in`, proxy OFF  
- [ ] `curl` to `/iclock/getrequest` returns `OK`  
- [ ] Access logs show `ATTLOG` posts -> 200  
- [ ] Test punch → attendance + last sync  

---

Related: `connector/README.md` (LAN connector), `direct_cloud_setup_essl.txt` (webhook variant), `BIOMETRIC_SETUP.md` (overview).
