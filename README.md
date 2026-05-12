# Ichthyolog — v1 (prototype)

A lightweight, offline-first web app for logging biological field samples from an iPhone. Built as a single HTML file so it needs no App Store, no developer account, and no build tools — just open it in Safari on your iPhone and add it to the Home Screen.

## What v1 does today

- **Sample IDs**: auto-generated in your format — `SPP_SITE_MMYYNN[_TISSUE]`.
  Example: `GPO_MBA_042608_F` (fin tissue of the 8th *Gymnothorax polyuranodon* from Monterey Bay in April 2026). The `NN` counter resets per species × site × month.
- **Tissue sub-samples**: one organism → many tissues (gill, fin, muscle, liver, whole…). Each tissue gets its own ID, preservation liquid, and storage location.
- **Defaults**: Ethanol 95% is the default preservation. You can override per tissue. Dropdowns for species, sites, tissues, and preservation are sorted most-recently-used first.
- **Auto-capture**: GPS (with accuracy), timestamp, collector initials on every sample.
- **Photos**: capture with the phone camera. Filenames match the sample ID (`GPO_MBA_042608_1.jpg`, `_2.jpg`, …). Photos are stored on-device until you export.
- **Projects & custom fields**: create projects (e.g., "Morphology study") that add project-specific prompts like standard length, eye diameter, weight. When someone picks that project, those fields appear automatically. A starter "Morphology study" project is pre-loaded.
- **Editable after collection**: storage location, preservation, species ID, notes, and adding more photos all stay editable from the sample detail screen.
- **On-the-fly additions**: any teammate can add new species, sites, tissues, or preservation liquids from the field (no admin review required — matches what you asked for).
- **Team + passcode**: shared passcode per project + "pick your name" on this device. Add and switch between teammates in Settings.
- **Offline-first**: everything lives in your phone's local database (IndexedDB). Works with zero signal.
- **Manual pin drop**: if GPS is flaky or you forgot to capture at the site, tap "Drop pin…" on any sample. Accepts decimal (`36.6202, -121.9033`), pasted Google Maps coords, or DMS (`36°37'12"N 121°54'12"W`).
- **Numeric keypad for numeric fields**: when creating a project template, tick "Numeric" on a field and iPhone will show the number pad.
- **No autocorrect on species name**: iOS won't "helpfully" rewrite *Gymnothorax polyuranodon* anymore.
- **Google Sheets sync**: one shared Google Sheet is the central database. The app POSTs new/changed samples to your Google Apps Script endpoint; rows are keyed by `sample_id` so re-syncing updates in place. See "Google Sheets sync setup" below.
- **Shared reference lists**: species, sites, tissues, preservations, storage locations, and projects also ride along in the sync. When a teammate adds a new species in the field, it shows up on everyone else's phone after their next sync (into `Species`, `Sites`, `Tissues`, `Preservations`, `StorageLocations`, and `Projects` tabs in the same sheet).
- **Browse cloud**: the Home menu has a "Browse cloud" tile that reads the Google Sheet back into the app so you can see the whole team's samples with filters for species, site, collector, project, and date range.
- **Add individual**: on the New Sample form, the "+ Add individual" button saves the current record and opens a fresh one pre-filled with the same species, site, and tissues (project-specific fields cleared) so you can rip through a stack of individuals without re-entering metadata. DJ Khaled says hello between each one.
- **Edit the sample ID**: the auto-generated ID is a starting point — tap **✎ Edit ID** on the New Sample form and type whatever you want. The app warns you if the ID is already used (locally or on the cloud mirror) before saving.
- **Editable code when adding a new code**: when you add a new species, site, or tissue from the field, the proposed short code is fully editable before you tap "Add" — useful when the default collides with an existing one or you want a custom abbreviation.
- **Entered after the fact**: tick "Entered after the fact" on the New Sample form to (a) edit the **Collected at** date/time and (b) reuse GPS coordinates from a previous sample at the same site. The button shows how many previously-recorded points exist for that site (combining local + cloud samples). The location pill is highlighted so you remember the GPS was reused rather than freshly captured.
- **Auto-pull on launch**: when the app opens it quietly fetches the team's latest reference lists (species, sites, tissues, etc.) so freshly added species/sites from teammates show up in your autosuggest without needing to tap a button. (Throttled to once every 5 minutes — silent if you're offline.)
- **Team-wide NN counter**: the `NN` part of the sample ID counts across the whole team. When a teammate creates `GPO_MBA_042601` and syncs, your phone proposes `GPO_MBA_042602` on the next sample at the same species/site/month — no two phones independently picking `01`.
- **Pull team changes**: an explicit **Pull team changes** button on the Projects screen and Export screen pulls the latest reference lists + sample mirror immediately (in case you don't want to wait for the auto-pull).
- **Collision detection**: when two offline phones independently create `GPO_MBA_042608`, the second phone's sync renames it to `GPO_MBA_042608_EW` (initials of whoever hits the server second). The phone's local record, photos, and photo filenames are all renamed too so nothing gets out of sync.
- **Photo ZIP export**: stage all photos into a single `.zip` containing `photos/` (full-res), `thumbnails/` (reduced quality, max 480px edge), and `photos.csv` manifest. Download over Wi-Fi, drag onto your external hard drive.
- **Export**: CSV (one row per tissue, with all fields including custom project fields) + JSON backup + photos ZIP.

## What's coming next (not in v1)

- One-tap Google Drive sync for full-resolution photos (right now it's a ZIP download instead)
- Barcode/QR scanning for pre-printed labels
- Map view of all samples with offline tiles

## How to put it on your iPhone

iOS won't run a raw `.html` file as an app — it needs to be served from a URL (HTTPS). That also unlocks GPS and the standalone Home Screen launch.

**Easiest path — Netlify Drop (under 2 minutes, no account required):**

1. On your Mac, open https://app.netlify.com/drop
2. Drag the entire **`sample-collector` folder** (not just `index.html`) onto the page. It must include `index.html`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` for the Home Screen app to launch standalone.
3. Netlify gives you a URL like `https://playful-bunny-123.netlify.app`.
4. Text/email that URL to yourself and open it in **Safari** on your iPhone.
5. Tap the **Share** icon → **Add to Home Screen** → name it "Samples."
6. **Important:** close Safari entirely, then tap the new icon on your Home Screen. It should launch without the Safari URL bar.
7. First launch will ask for **Location** and **Camera** — allow both.

If you tap the Home Screen icon and it still opens inside Safari with a URL bar:
- Delete the icon.
- Revisit the URL in Safari, **pull down to refresh** once to make sure the latest `manifest.webmanifest` is loaded.
- Then Share → Add to Home Screen again.

**Sharing with your team:**
Give them the same URL. Each phone stores its own local data and syncs to the shared Google Sheet (see below).

## Recommended permanent host: GitHub Pages (free, stable, no time limit)

Netlify Drop URLs expire after ~1 hour. GitHub Pages gives you a permanent URL tied to a repo you own. You can update the app by re-uploading files, and teammates' Home Screen icons keep working forever. No git CLI needed — everything is point-and-click on github.com.

**One-time setup (about 5 minutes):**

1. Go to https://github.com and sign in (or create a free account).
2. Click the **+** in the top-right → **New repository**.
   - Repository name: `sample-collector` (or any name you want; the URL will include it)
   - Set to **Public** (required for free GitHub Pages).
   - Tick **Add a README file**.
   - Click **Create repository**.
3. On the new repo page, click **Add file → Upload files**.
4. Drag the contents of your `sample-collector` folder onto the page — specifically these files:
   - `index.html`
   - `manifest.webmanifest`
   - `icon-192.png`, `icon-512.png`, `icon-1024.png`
   - `apple-touch-icon.png`
   - `Bernardi_Lab_Logo.svg` (optional)
   - `apps-script.gs` (optional — this one isn't served, but keeping it in the repo makes it easy to find)
   - `README.md` (optional)
   
   Wait for the progress bar to finish, then scroll down and click **Commit changes**.
5. Click **Settings** (in the repo's top menu) → **Pages** (left sidebar).
6. Under **Build and deployment → Source**, pick **Deploy from a branch**.
7. Under **Branch**, pick **main** and **/ (root)**. Click **Save**.
8. Wait 30–60 seconds, then refresh the Pages page. You'll see a green banner: **Your site is live at** `https://<your-username>.github.io/sample-collector/`.
9. On your iPhone: open that URL in Safari → **Share → Add to Home Screen**.

**Updating the app later:**

1. Open the repo on github.com.
2. Click the file you want to replace (e.g. `index.html`) → pencil icon → paste in the new contents → **Commit changes**.
3. Or: **Add file → Upload files** again and drop in the new copies (tick "Replace" when prompted).
4. GitHub Pages rebuilds automatically in ~30 seconds. Teammates see the update the next time they open the app online.

**If you want a cleaner URL without `/sample-collector/` at the end:**
Rename the repo to `<your-username>.github.io` (exactly — your GitHub username followed by `.github.io`). Then the URL becomes `https://<your-username>.github.io/` with no path. Only works for one repo per account.

Other good alternatives if you prefer:

- **Cloudflare Pages** — similar point-and-click flow, faster CDN, optional custom domain.
- **Vercel** — nice if you're already using it, but overkill for a static folder.
- **Netlify** — same as Drop but with a free account you get a permanent URL instead of a 1-hour one. `app.netlify.com → Add new site → Deploy manually`.

**If the Home Screen icon still opens in Safari with a URL bar:**
This happens when the folder you uploaded to Netlify is missing the PNG icons or the manifest. Make sure the folder you drag in contains **all** of these files:

- `index.html`
- `manifest.webmanifest`
- `icon-192.png`, `icon-512.png`, `icon-1024.png`
- `apple-touch-icon.png`

Then on the iPhone: delete the old Home Screen icon, open the URL in Safari, pull down to refresh once, and Share → Add to Home Screen again. iOS 16.4+ needs the manifest file AND a 180×180 PNG apple-touch-icon to launch standalone.

**Updating the app:**
Drag the `sample-collector` folder onto Netlify Drop again and it re-deploys to the same URL. Teammates' Home Screen icons pick up the new version the next time they open the app with Wi-Fi.

## Testing it quickly on your Mac

Just double-click `index.html` — it opens in your browser. You can poke around every flow, add samples, export CSV, etc. Note that desktop browsers have no camera shutter, so "Take photo" will open a file picker; GPS will use your Mac's IP-based coordinates.

## ID format details

- Parent organism: `{SPECIES}_{SITE}_{MMYY}{NN}`
  - `MM` = 2-digit month, `YY` = 2-digit year (e.g. `0426` for April 2026).
  - `NN` = ordinal of this species at this site in the current **month**. Resets on the 1st of each month.
- Tissue sub-sample: `{PARENT}_{TISSUE_CODE}` (e.g., `GPO_MBA_042608_F`)
- Photos: `{PARENT}_{sequence}.jpg` (attached to the parent organism; all tissues inherit them)
- Collector initials: currently stored as a field on every record, not appended to the ID. They'll only be appended at sync time if the server detects a duplicate from another offline device.

## Data model

Local storage uses IndexedDB with these object stores:

- `settings` — passcode, active collector, onboarding flag
- `people` — collectors on this device
- `projects` — project names + custom field definitions
- `species`, `sites`, `tissues`, `preservations`, `storageLocations` — reference lists
- `samples` — one record per organism (contains an array of tissue sub-samples)
- `photos` — one record per photo (full blob + thumbnail)
- `remoteSamples` — a cached mirror of every row in the team's Google Sheet so the NN counter, ID uniqueness check, and site-GPS reuse all work even when offline

The CSV export flattens to one row per tissue and includes all custom-field columns any sample has used.

## Google Sheets sync setup

One person (you) sets this up once, then every phone just pastes the resulting URL into Settings. Takes about 3 minutes.

1. Create (or open) the Google Sheet you want samples to land in. Any empty sheet is fine — the script creates a `Samples` tab and fills in headers automatically.
2. In that sheet: **Extensions → Apps Script**.
3. Delete whatever is in `Code.gs` and paste the entire contents of `apps-script.gs` (included in this folder).
4. **File → Save**.
5. **Deploy → New deployment**:
   - Select type: **Web app**
   - Description: `Sample Collector v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** → authorize when prompted. The permission grant only gives the script access to *this one* spreadsheet.
6. Copy the **Web app URL** that ends in `/exec`.
7. On each phone: open the app → **Settings** → paste the URL into **Google Sheet sync URL** → tap **Test connection** (should say "endpoint is live").
8. From **Export**, tap **Sync to Google Sheet** to push everything.

**How it behaves:**
- Rows are keyed by `sample_id` (`GPO_MBA_042608_F`, etc). Re-syncing the same sample updates that row in place instead of adding a duplicate.
- When someone adds a custom project field (e.g. `eye_diameter_mm`), the sheet grows a new column automatically on the next sync.
- Everyone posts to the same URL, so the sheet is the single source of truth for the lab.

**Updating the script later** (if we tweak `apps-script.gs`):
Open Apps Script → paste the new version → Save → **Deploy → Manage deployments → pencil on the active one → New version → Deploy**. Don't create a fresh deployment or the URL changes and every phone needs re-pasted.

**Heads-up for labs upgrading from the first deploy:** the current `apps-script.gs` adds new tabs — `Species`, `Sites`, `Tissues`, `Preservations`, `StorageLocations`, `Projects` — and supports `GET ?action=samples` for the Browse view. If you updated from an older version, redeploy the script so those endpoints exist before tapping "Browse cloud" or syncing.

## Files

- `index.html` — the whole app
- `manifest.webmanifest` — PWA metadata so iOS launches it standalone from Home Screen
- `icon-192.png`, `icon-512.png`, `icon-1024.png` — Home Screen icons (Android / generic)
- `apple-touch-icon.png` — 180×180 iOS Home Screen icon
- `Bernardi_Lab_Logo.svg` — source logo (kept for reference, not served)
- `another_one.jpg` — splash image for the "+ Add individual" transition
- `apps-script.gs` — Google Apps Script that receives sync posts (deploy once per lab; see above)
- `README.md` — this doc

Deploy the whole `sample-collector` folder as-is to Netlify (don't split the files). `apps-script.gs` is not served by Netlify — it's pasted into Google Apps Script separately.

---

Open `index.html` and try it out. Then let me know what to adjust — common requests I expect:

- Different starter species/sites for your actual study
- Additional tissue codes
- More custom project templates
- Tweaks to the Google Sheet column order or adding a thumbnails column
