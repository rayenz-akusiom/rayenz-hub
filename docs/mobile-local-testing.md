# Mobile testing on the local network

Use your PC’s Vite (and optional SAM local API) from a phone on the same Wi‑Fi — no GitHub Pages or AWS deploy required.

See also [local-setup.md](./local-setup.md) for day-to-day local workflow.

---

## Prerequisites

- Phone and PC on the **same LAN** (same Wi‑Fi / subnet).
- Know the PC’s LAN IP (`ipconfig` → IPv4, e.g. `192.168.1.42`).
- Windows Firewall: allow inbound TCP on **5173** (Vite) and, if using the API, **3000**.

If the phone cannot reach the PC, check for router **AP / client isolation** (common on guest networks) and disable it or use the main LAN.

---

## 1. SPA only

Vite binds to localhost by default. Expose it on the LAN:

```powershell
npm run dev:web -- --host
```

Vite prints a Network URL such as `http://192.168.x.x:5173/`. Open that on the phone.

Optional permanent config in `packages/web/vite.config.ts`:

```ts
server: { host: true }, // or host: '0.0.0.0'
```

### Production-like build on LAN

```powershell
npm run build:web
npm run preview -w @rayenz-hub/web -- --host
```

Use the Network URL Vite preview prints.

---

## 2. Hub API from the phone (optional)

`127.0.0.1` / `localhost` on the phone is the **phone**, not your PC. Default `sam local start-api` also binds to `127.0.0.1` only.

Start the API on all interfaces (after DynamoDB Local / MinIO as in [local-setup.md](./local-setup.md)):

```powershell
sam local start-api --template .aws-sam/build/template.yaml --env-vars infra/env.local.json --port 3000 --host 0.0.0.0
```

Or extend `npm run start:api` with `--host 0.0.0.0`.

On the **phone** browser (DevTools console or Settings), set:

```javascript
localStorage.setItem('rayenz-hub-api-url', 'http://192.168.x.x:3000');
localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');
```

Use the PC’s LAN IP, not `127.0.0.1`. Phone `localStorage` is separate from the PC’s — configure it on the device.

CORS allows `*` in `infra/template.yaml`, so cross-origin from the Vite origin is fine.

---

## 3. Checklist

1. PC + phone on same LAN  
2. `npm run dev:web -- --host`  
3. Firewall allows 5173 (and 3000 if needed)  
4. Phone → `http://<PC-LAN-IP>:5173` (or the port Vite prints)  
5. If API: SAM with `--host 0.0.0.0`, API URL = `http://<PC-LAN-IP>:3000`

---

## Caveats

| Issue | Impact |
| ----- | ------ |
| `isLocalHub()` only treats `localhost` / `127.0.0.1` | Sessions via LAN IP do not get localhost-only UI (e.g. some Deck Suggest debug). Most apps still work. |
| Router AP / client isolation | Phone cannot reach PC — turn isolation off or avoid guest Wi‑Fi. |
| Mixed Wi‑Fi / Ethernet | Prefer the same subnet; confirm with `ipconfig` on the PC. |
