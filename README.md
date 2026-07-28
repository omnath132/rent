# 🏠 Rent & Utilities Tracker

A zero-backend rent + utilities tracker for the house. Pure static files — no build
step, no database, nothing to install.

## How it works

- **All the data lives in [`data.js`](data.js)** — rents, utility bills, split rules,
  and the payments log. Edit it, push, and Vercel redeploys in ~20 seconds.
- Rent is for the **month ahead**, utilities for the **month just ending** — both
  land on the **28th**.
- **Rent + water** go to the landlord; **wifi/gas/electric** go to the utility
  company. The Pay tab has one-tap buttons for both — pay just your share, or front
  the whole house and the app tracks who owes you back.
- The site remembers **who you are** (tap your name once) and shows your balance
  front and center.
- Buttons and the bill editor save to *your device* first, then give you a
  **"Copy for data.js"** snippet to paste into the repo so everyone sees it.

## Shared live data (one-time, ~2 minutes)

With this on, edits and payments save instantly for the whole house — no more
pasting into `data.js`:

1. Vercel dashboard → your project → **Storage** tab → **Create Database** →
   pick **Upstash Redis** (free plan) → accept the defaults.
2. Redeploy (or just push anything).

That's it — the env vars are injected automatically and `/api/data` starts
working. Bill edits and pay-button taps now sync for everyone, and the site
refreshes itself when you come back to the tab. Without the store, the site
still works — it just falls back to per-device saving with the
"Copy for data.js" flow.

`data.js` stays the baseline (rents, lease dates, who fronts which bill);
the shared store holds bill edits and the payments log on top of it.

## Updating the numbers (monthly routine)

1. Bills arrive → open the **Bills** tab, type them in.
2. People pay → tap the pay buttons.
3. That's all, if shared storage is on. Otherwise tap **Copy for data.js**,
   paste over the matching block in `data.js`, commit, push.

## Deploy to Vercel (one-time, ~3 minutes)

```bash
cd rent-tracker
git init
git add .
git commit -m "Rent tracker"
git branch -M main
git remote add origin https://github.com/YOUR-PERSONAL-USERNAME/rent-tracker.git
git push -u origin main
```

Then at [vercel.com](https://vercel.com):
1. Sign in **with your personal GitHub account**.
2. **Add New → Project** → import `rent-tracker`.
3. Framework preset: **Other**. No build command, no output directory. **Deploy.**

Every push to `main` redeploys automatically. Share the URL with the house.

> **Two GitHub accounts?** Vercel signs in through one GitHub identity, but you can
> push to your personal repo from this machine even if work credentials are the
> default: use the full HTTPS URL above and Git Credential Manager will let you pick
> the account, or set `git config user.email` per-repo.

## Files

| File | What it is |
|---|---|
| `data.js` | **The only file you edit** — all numbers live here |
| `index.html` | Page structure |
| `styles.css` | Styling (light + dark, phone + desktop) |
| `app.js` | The money math: schedule, splits, balances, settle-up |
| `ui.js` | Rendering and buttons |
