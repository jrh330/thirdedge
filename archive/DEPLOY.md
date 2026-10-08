# Third Edge — Multiplayer Deploy Guide

## What You're Deploying

A multiplayer card game with:
- **Frontend**: Static HTML page served by Vercel
- **Backend**: 4 Vercel serverless API routes (create, join, poll, action)
- **Database**: MongoDB Atlas (free tier) storing game state

## Prerequisites

- GitHub account
- Vercel account (free, sign in with GitHub)
- MongoDB Atlas account (free)

---

## Step 1: Set Up MongoDB Atlas (5 minutes)

1. Go to [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas) and create a free account
2. Create a **free cluster** (M0 Sandbox — completely free)
3. Choose any cloud provider/region (AWS us-east-1 is fine)
4. While cluster is creating, click **Database Access** → **Add New Database User**:
   - Username: `thirdedge`
   - Password: generate a strong password (save it!)
   - Role: Read and Write to Any Database
5. Click **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (0.0.0.0/0)
   - This is fine for a prototype; you'd restrict this in production
6. Once cluster is ready, click **Connect** → **Drivers** → Copy the connection string
   - It looks like: `mongodb+srv://thirdedge:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   - Replace `<password>` with your actual password
   - **Save this string** — you'll need it in Step 3

---

## Step 2: Push to GitHub (2 minutes)

1. Create a new GitHub repository (e.g., `third-edge`)
2. Upload or push the project files. Your repo structure should be:

```
third-edge/
├── api/
│   ├── _db.js          (MongoDB connection helper — not a route)
│   ├── _game.js         (Card universe & helpers — not a route)
│   ├── create.js        (POST /api/create)
│   ├── join.js          (POST /api/join)
│   ├── poll.js          (GET /api/poll)
│   └── action.js        (POST /api/action)
├── public/
│   └── index.html       (The entire game frontend)
├── package.json
└── vercel.json
```

Note: Files starting with `_` (like `_db.js`, `_game.js`) are helpers, not API routes.
Vercel automatically ignores files with `_` prefix as routes.

---

## Step 3: Deploy to Vercel (3 minutes)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New...** → **Project**
3. Import your `third-edge` GitHub repository
4. In the project settings, expand **Environment Variables** and add:
   - Name: `MONGODB_URI`
   - Value: Your MongoDB connection string from Step 1
5. Click **Deploy**
6. Wait ~60 seconds. Vercel will build and deploy your project
7. You'll get a URL like `https://third-edge-xxxxx.vercel.app`

**That's it. Your game is live.**

---

## Step 4: Play!

1. Open your Vercel URL in a browser
2. Click **Create Game**
3. You'll see a 4-character room code (e.g., `X7KP`)
4. Send that code to your friend
5. They open the same URL, enter the code, and click **Join**
6. Both of you pick rosters → pick hands → play!

### Playing on the same device (for testing)
Open two browser tabs/windows to the same URL. Create in one, join in the other.

---

## How It Works

### Architecture
```
Player 1 Browser ←→ Vercel API Routes ←→ MongoDB ←→ Vercel API Routes ←→ Player 2 Browser
```

Both players poll the server every ~1.2 seconds. When both players have submitted
their action (roster, hand, or card play), the server resolves the result.

### API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/create` | POST | Create a new game room, get room code |
| `/api/join` | POST | Join existing room with code |
| `/api/poll` | GET | Get current game state (called every 1.2s) |
| `/api/action` | POST | Submit roster, hand, or card play |

### Security

- The attribute sequence is generated **server-side** and never sent to clients
- Players only see their own cards; opponent cards are hidden until both play
- All card plays are validated against the player's hand
- Room codes use unambiguous characters (no O/0, I/1, etc.)

---

## Troubleshooting

### "Room not found" error
- Room codes expire when a game completes
- Codes are case-insensitive but must be exactly 4 characters
- Make sure you haven't already joined (refresh and try again)

### Game feels laggy
- Polling interval is 1.2 seconds — this is normal
- The reveal animation masks the delay (3.5 seconds of theater)
- If it feels too slow, you can reduce the poll interval in the frontend

### MongoDB connection errors
- Check your MONGODB_URI environment variable in Vercel
- Make sure your MongoDB Atlas network access allows 0.0.0.0/0
- Check that your database user password is correct

### Vercel deploy errors
- Make sure `_db.js` and `_game.js` start with underscore (not exposed as routes)
- Check that `package.json` lists `mongodb` as a dependency
- Vercel will auto-install dependencies

---

## Cost

- **Vercel**: Free tier covers ~100K serverless function invocations/month
  (a full game series is ~50 API calls, so ~2,000 games/month free)
- **MongoDB Atlas**: Free M0 cluster has 512MB storage
  (each game document is ~2KB, so ~250,000 games before running out)
- **Total: $0/month** for prototype-level usage

---

## Next Steps (Optional)

- Add a timer (currently no auto-play on timeout in multiplayer)
- Add player names
- Add rematch functionality
- Test the specialist vs balanced balance question with a real human opponent
