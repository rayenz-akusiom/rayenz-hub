# Mobile testing on the local network

Use your PC’s Vite (and optional SAM local API) from a phone or iPad on the same Wi‑Fi — no GitHub Pages or AWS deploy required.

Vite and `npm run start:api` bind on the LAN by default. Prefer the [local development dashboard](./local-setup.md#2b-local-development-dashboard-recommended) for device URLs. Configure the API on the phone via **Settings → Hub API**.

See also [local-setup.md](./local-setup.md) for day-to-day local workflow.

---

## Prerequisites

- Phone and PC on the **same LAN** (same Wi‑Fi / subnet).
- Windows Firewall: allow inbound TCP on **5173** (Vite) and, if using the API, **3000**.

If the phone cannot reach the PC, check for router **AP / client isolation** (common on guest networks) and disable it or use the main LAN.

---

## 1. Recommended — dashboard

```powershell
npm run dev:dashboard
```

Open [http://127.0.0.1:5050](http://127.0.0.1:5050) on the PC. Use **Start all** (or start Web / API as needed).

The **Device access (LAN)** panel lists:

- Hub Web URL (`http://<PC-LAN-IP>:5173`) — open this on the phone/iPad
- Hub API base URL (`http://<PC-LAN-IP>:3000`)
- When the API is running, a copyable `localStorage` snippet (fallback)

On the phone, open Hub → **Settings → Hub API**, paste the LAN API URL, and **Sign in** as Rayenz.

The control panel stays on localhost; only Hub Web and Hub API are meant for devices.

---

## 2. SPA only (CLI)

```powershell
npm run dev:web
```

Vite prints a Network URL such as `http://192.168.x.x:5173/`. Open that on the phone (or use the dashboard Device access panel).

### Production-like build on LAN

```powershell
npm run build:web
npm run preview -w @rayenz-hub/web
```

(`preview` also binds on the LAN via Vite config.) Use the Network URL Vite prints.

---

## 3. Hub API from the phone (optional)

`127.0.0.1` / `localhost` on the phone is the **phone**, not your PC.

After DynamoDB Local / MinIO as in [local-setup.md](./local-setup.md):

```powershell
npm run start:api
```

(`start:api` includes `--host 0.0.0.0`.) Or start **Hub API (SAM)** from the dashboard.

On the phone/iPad Hub:

1. Open **Settings → Hub API** (`#/settings/hub-api`)
2. API base URL = `http://<PC-LAN-IP>:3000` (from the dashboard Device access panel)
3. Sign in as Rayenz
4. Save (optional: Test connection)

Fallback — phone browser console or dashboard snippet:

```javascript
localStorage.setItem('rayenz-hub-api-url', 'http://192.168.x.x:3000');
```

Then sign in on the Settings → Hub API tab.

Use the PC’s LAN IP, not `127.0.0.1`. Phone storage is separate from the PC’s — configure it on the device.

CORS allows `*` in `infra/template.yaml`, so cross-origin from the Vite origin is fine.

---

## 4. Checklist

1. PC + phone on same LAN  
2. `npm run dev:dashboard` (or `npm run dev:web` / `npm run start:api`)  
3. Firewall allows 5173 (and 3000 if needed)  
4. Phone → Hub Web URL from Device access (or Vite Network URL)  
5. If API: Settings → Hub API on the device (`http://<PC-LAN-IP>:3000` + Sign in)

---

## Caveats

| Issue | Impact |
| ----- | ------ |
| `isLocalHub()` only treats `localhost` / `127.0.0.1` | Sessions via LAN IP do not get localhost-only UI (e.g. some Deck Suggest debug). Most apps still work. |
| Router AP / client isolation | Phone cannot reach PC — turn isolation off or avoid guest Wi‑Fi. |
| Mixed Wi‑Fi / Ethernet | Prefer the same subnet; confirm with `ipconfig` on the PC. |
| Dashboard itself is localhost-only | Open `http://127.0.0.1:5050` on the PC; use Device access URLs on the phone. |
