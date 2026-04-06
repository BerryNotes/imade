# iMade

A personal song library with drag-and-drop bulk upload, custom genres, and a head-to-head battle system that ranks all your songs using Elo ratings.

## Repository Structure

This is a monorepo containing all iMade projects:

```
/                   — Main app (React + Vite + Express + Electron)
/admin/             — Admin dashboard (vanilla HTML/JS)
/site/              — Marketing & landing page (Next.js + Tailwind)
/build/             — Electron build configs
/.github/           — CI/CD workflows
```

## Main App

### Setup (one time)

1. **Install Node.js** if you don't have it: https://nodejs.org (LTS version)
2. Open a terminal in this folder and run:
   ```
   npm install
   ```

### Run

```
npm start
```

Open the URL it prints — use the Network URL to access from your phone.

### Features

- **Upload** — Drag and drop songs in bulk. Dates are pulled from file modification times, titles from filenames.
- **Library** — Browse, search, filter by genre, edit song details.
- **Genres** — Create your own genre names and manage them.
- **Battle** — Pick between two songs at a time. Work through all matchups at your own pace.
- **Rankings** — Once you've done enough comparisons, see your songs ranked by Elo rating with win/loss records.
- **Stats** — Analytics dashboard with listening trends and Elo variance analysis.
- **Admin** — User management, session tracking, and email notifications.

### Data

Everything is stored in the `data/` folder:
- `songs.json` — song metadata
- `genres.json` — your custom genres
- `comparisons.json` — battle results

Audio files are in `uploads/`. Back up these two folders and you're safe.

## Admin Dashboard

Located in `/admin/`. A standalone HTML admin panel served by the main app at the `/admin` route. Provides user management, session tracking, and activity monitoring.

## Marketing Site

Located in `/site/`. A Next.js landing page with feature showcases and changelog.

```bash
cd site
npm install
npm run dev
```

Deployed to Vercel / Cloudflare Workers.
