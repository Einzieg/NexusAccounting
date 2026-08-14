# Privacy Policy — Nexus Accounting

**Last updated: 2026-08-15**

Nexus Accounting is a browser extension that reads your Nexus Legacy game data and displays it locally as a personal accounting dashboard. This policy describes exactly what data the extension accesses, how it is used, and where it goes.

---

## 1. Data collected

The extension reads the following data from the selected Nexus Legacy game API (`s0.nexuslegacy.space` or `nf.nexuslegacy.space`) on your behalf:

| Category | Examples |
|---|---|
| Mission reports | Survey, pirate raid, mining, expedition, wormhole run, and debris collection results |
| Fleet data | Your stationed ships; your own fleet compositions sent on missions |
| Combat intelligence | Enemy fleet and defense data from spy and camp-scout reports you ran in game |
| Research | Your tech tree progress, active research, per-planet lab levels and speed |
| Planets & buildings | Your planets, their buildings (to read lab levels), and stationed fleets |
| Galaxy map | System names, security zones, arm/sector coordinates (for zone tagging and the planet finder) |
| Fuel logs | Hydrogen cost per launched mission (type, zone, amount) |
| Market history | Your completed trades, resource amounts, fees, counterpart player names or identifiers, and timestamps |
| In-game identity | Your in-game player name and player names that already appear in game reports or market records |
| Plans and preferences | Fleet templates, research queues, filters, selected server, and other extension settings you create |

The extension sends API requests through a content script running in an already authenticated Nexus Legacy game tab. The browser attaches the HttpOnly session cookie automatically; the extension does not read, store, forward, write, or modify cookie values.

---

## 2. How the data is used

All data is used **solely to operate the extension's dashboard** on your own device:

- Build aggregated statistics (resources collected, ships lost, fuel spent, etc.)
- Render charts, history tables, and the tech-tree planner
- Calculate market resource flows, fees, and estimated profit
- Run the offline combat simulator
- Drive the planet-finder galaxy scan
- Save fleet templates and other plans that you explicitly create

No data is used for advertising, profiling, or any purpose unrelated to displaying your own game statistics back to you.

---

## 3. Where the data is stored

All data is stored **locally on your device only**, in the browser's `storage.local` area (isolated to this extension and separated by selected game server). Nothing is uploaded to any server operated by the extension author.

The extension also writes automatic backup files to your `Downloads/NexusAccounting/` folder before destructive operations (reset, import, schema migrations) and as a weekly auto-backup. These files are plain JSON and remain on your device under your control.

---

## 4. Data sharing and third parties

**No data is shared with any third party.** All network communication is exclusively between your browser and `nexuslegacy.space` (the game's own servers). The extension does not contact any analytics service, telemetry endpoint, or server operated by the extension author.

---

## 5. User-initiated game operations

The extension can send write requests to the game only after you explicitly choose an action in its interface. These actions include starting a research job, dispatching a fleet mission, and transferring resources or ships between your colonies. Where the operation changes game state, the extension displays the relevant plan or confirmation before sending it. Background synchronization and reporting requests are read-only.

---

## 6. Data retention and deletion

Data accumulates in local storage as long as the extension is installed. You can:

- **Export** a full JSON backup at any time from the dashboard.
- **Reset** the selected server's stored data from the dashboard (a backup is created first).
- **Uninstall** the extension — the browser removes all `storage.local` data on uninstall.

Backup files in your Downloads folder are not deleted automatically; you can delete them manually at any time.

---

## 7. Security

All communication with the game API uses HTTPS and runs same-origin inside the selected Nexus Legacy game tab. Session cookies remain managed by the browser and are never exposed to the extension.

---

## 8. Contact

If you have questions about this policy, open an issue at [github.com/Einzieg/NexusAccounting](https://github.com/Einzieg/NexusAccounting/issues).
