# Allagaroo — game server

*Allagaroo (slogan: Play Anything) is an online head-to-head card game where players play with
cards they create themselves.* This repo is the running game. The design — rules, rubric
history, mockups, simulations — is in `../card-game/`.

**Live:** https://thirdedge-production-f327.up.railway.app  ·  **Admin:** `/admin`

## How it's put together

| Folder | What's in it |
|---|---|
| `server.js` | Express app: routes, static files, the sign-in pages |
| `api2/` | Route handlers — minting (`check.js`, `mint.js`), collections, matches, admin |
| `engine2/` | Turn and match rules (pure functions, Jest tests in `__tests__/`) |
| `game/` | Collection and minting logic shared with the client (node:test) |
| `auth/` | Invite links, the session cookie, `requirePlayer(req)` |
| `client/` | Vite + React app. **Its build is committed** to `public/mint/` |
| `rubric.md` | The card-scoring rubric sent to Claude as the system prompt |
| `archive/` | The v1 prototype and retired files. Not served, not built from |

Pages: `/play` (home), `/make` (make a card), `/g/CODE` (a match), `/j/TOKEN` (invite link),
`/admin`. The bare address redirects to `/play`.

## Deploying (Railway)

Railway builds from `main` on GitHub (`jrh330/thirdedge`) and runs `npm start`.

1. If you changed anything in `client/`, rebuild it first — the server serves the committed
   build, Railway doesn't build the client:
   ```bash
   cd client && npm install && npm run build && cd ..
   ```
2. Commit and `git push`. Railway deploys on its own; check the Deployments tab shows the new
   commit as **Active**.

### Settings (Railway → service → Variables)

| Variable | |
|---|---|
| `MONGODB_URI` | MongoDB connection string (`MONGO_URL` also accepted) |
| `ANTHROPIC_API_KEY` | Card scoring. **Create it with no expiry** — a 30-day key silently broke minting once |
| `CLOUDINARY_API_SECRET` | Card picture storage (cloud name and API key are in `api2/_cloudinary.js`) |
| `SESSION_SECRET` | Signs player cookies. Changing it signs everyone out |
| `ADMIN_SECRET` | The `/admin` password |
| `PUBLIC_BASE_URL` | `https://thirdedge-production-f327.up.railway.app` — used to build invite links |
| `NODE_ENV` | `production` |

Never set `DEV_FAKE_AI` or `DEV_FAKE_PLAYER` on Railway (they're refused in production anyway).

## Running a two-device playtest

1. `/admin` → **Create invite** for each player. Use the **Copy** button and send the link
   without retyping it (no `www.` in front).
2. Each player opens their link once on their own device and confirms their name. They start
   with 12 sample cards.
3. Optional: each player mints a card (**Make a card**) and puts it in their active 12.
4. Start a match: either **Pair two testers** on the admin page (each player opens their own
   link), or one player taps Play → **Create Game** and the other types the code under
   **Joining someone else's game?**

If minting fails, the Railway logs lines starting `check:` say why.

## Tests

```bash
npx jest engine2        # rules engine
npm test                # game/ collection + minting logic
```
