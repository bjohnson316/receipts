# Receipt Ledger

Capture receipts with your phone camera, catalog them by category, track a running total, and export a real PDF expense report — generated directly in the browser, no print dialog involved, so it works the same on phones as on desktop.

Receipt data and photos can be stored two ways:

- **GitHub storage (recommended)** — receipts are saved as a JSON file and each photo as its own image file, committed directly to a repo of your choice via the GitHub API from the browser. Syncs across every device you open the app on.
- **Local only (default until configured)** — falls back to the browser's `localStorage` on this one device.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

**Option A — automatic (recommended)**

1. Push this repo to GitHub.
2. In the repo settings, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` — the included workflow (`.github/workflows/deploy.yml`) builds and deploys automatically. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

**Option B — manual, via the `gh-pages` package**

```bash
npm install
npm run build
npm run deploy
```

This pushes the `dist/` folder to a `gh-pages` branch. Then in **Settings → Pages**, set **Source** to the `gh-pages` branch.

## Set up GitHub storage

The app can store your receipts (and photos) directly in a GitHub repo instead of just the browser, so data follows you across devices. You can use the same repo the site is hosted from, or a separate private one just for data.

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Under **Repository access**, choose **Only select repositories** and pick the repo you want receipts stored in.
3. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**. Leave everything else as No access.
4. Generate the token and copy it.
5. In the app, tap the cloud icon (top right) → fill in the repo owner, repo name, branch (usually `main`), and paste the token → **Connect**.

The token is stored in that browser's `localStorage` and used only to call `api.github.com` directly — there's no server in between. Because it lives in client-side storage, treat it like any other credential: use a token scoped to just this one repo's Contents permission, not a broad-access token, and revoke it from GitHub's token settings if you ever need to.

Receipts are saved to `data/receipts.json` and photos to `images/` in the repo, each as a normal commit.

## Notes

- If you don't configure GitHub storage, receipts stay in the browser's `localStorage`, which is per-device and capped around 5–10MB.
- "Export PDF" builds a real `.pdf` file client-side (via `jsPDF`) and downloads it directly — no print dialog, so it works reliably on mobile.
- Camera capture uses `<input type="file" capture="environment">`, which opens the rear camera directly on most mobile browsers.
- The app ships with a favicon and "Add to Home Screen" icons (`public/manifest.webmanifest`), so it looks and behaves like an installed app on both iOS and Android.
