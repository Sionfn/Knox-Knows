# Knox Knows Discord bot

One slash command, `/ask`, for the Knox Knows Discord server.

- `/ask question:<text>` sends the question to Knox (the same AI the website uses, in **Learn mode**). Knox guides the student with hints and questions instead of handing over answers, and won't help with a test or exam that's happening right now.
- Works only in **#study-help** (and threads inside it). Anywhere else, the student gets a private message pointing them there.
- **Reply button:** every answer has a 💬 Reply to Knox button. The student types their answer in a pop-up and Knox continues the same lesson, remembering what it asked. Replies are free (they don't use a daily question). Only the student who asked can reply, and a lesson allows 10 replies within 2 hours.
- **5 questions per person per day** (resets at midnight UTC). Every answer shows how many are left. Members with the **Knox Plus** role have no limit.
- **Cost guard:** `DAILY_GLOBAL_CAP` limits how many questions the whole server can ask per day, Plus members and lesson replies included. Once it's reached, `/ask` politely says to try again tomorrow.
- If Knox fails or times out, the student gets a polite message and the question doesn't count.
- Slash commands only. The bot doesn't read normal messages, so it doesn't need the Message Content intent.

## Files

| File | What it does |
| --- | --- |
| `src/index.js` | Starts the bot and routes `/ask` |
| `src/ask.js` | `/ask` and the Reply button: channel check, limits, posting answers |
| `src/lessons.js` | Remembers each lesson so replies continue it |
| `src/store.js` | Saves state to small JSON files |
| `src/knox.js` | Calls the Knox API |
| `src/limits.js` | Daily counts per user and the global cap, saved to a small JSON file |
| `src/split.js` | Splits long answers under Discord's 2000-character limit |
| `src/register-commands.js` | Registers `/ask` by hand (optional; the bot does this itself on startup) |
| `test/` | Tests (`npm test`) |

## Run it on your computer

Needs Node.js 22.9 or newer.

```bash
cd discord-bot
npm install
cp .env.example .env     # then fill in .env (never commit it; it's git-ignored)
npm run dev
```

You should see `Knox bot online as …` and `/ask registered …`. The bot registers `/ask` with Discord every time it starts.

### What goes in `.env`

| Setting | Where to get it |
| --- | --- |
| `DISCORD_TOKEN`, `DISCORD_APP_ID` | Discord Developer Portal → your Knox Knows application |
| `DISCORD_GUILD_ID` | Right-click your server → Copy Server ID (turn on Developer Mode in Discord settings → Advanced) |
| `STUDY_HELP_CHANNEL_ID` | Already set to #study-help |
| `KNOX_PLUS_ROLE_ID` | Server Settings → Roles → right-click Knox Plus → Copy Role ID |
| `KNOX_API_URL`, `KNOX_BOT_KEY` | See "Connecting to Knox" below |
| `DAILY_QUESTIONS_PER_USER` | Default 5 |
| `DAILY_GLOBAL_CAP` | Default 200. Your worst-case daily AI bill is this × your cost per question |
| `DATA_FILE` | Where daily counts are saved. On Railway, point it at the volume (below) |

### Add the bot to your server

Developer Portal → your application → OAuth2 → URL Generator: tick **bot** and **applications.commands**, then under Bot Permissions tick **Send Messages**. Open the generated link and pick the Knox Knows server.

## Connecting to Knox

The bot sends each question to the website's `/api/ask`:

```
POST https://knoxknowsapp.com/api/ask
X-Knox-Bot-Key: <KNOX_BOT_KEY>
{ "question": "...", "learnMode": true, "history": [ ...the lesson so far... ], "discordUserId": "..." }
→ { "answer": "..." }
```

The website accepts this once `KNOX_BOT_KEY` is set in Vercel (Settings → Environment Variables, then redeploy). Use the **same** value in Vercel and wherever the bot runs. It must be at least 32 characters; anything shorter, or no key at all, keeps bot access switched off.

Bot questions always use Learn mode, don't touch anyone's Knox credits, and show up in the admin panel's question totals. As a backstop if the key ever leaks, the website allows at most 100 bot questions an hour (change with `KNOX_BOT_HOURLY_LIMIT` in Vercel).

To make a good key, run this and copy the output:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Host it 24/7 on Railway

1. Push this repo to GitHub (already done if you're reading this there).
2. On [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** → pick Knox-Knows.
3. In the service's **Settings**, set **Root Directory** to `discord-bot`. Railway runs `npm install` and `npm start` on its own.
4. In **Variables**, add everything from `.env.example` with your real values. Put the token here, not in a file.
5. Right-click the service → **Attach Volume**, mount it at `/data`, and set `DATA_FILE=/data/usage.json` so daily counts survive redeploys.
6. Deploy. The logs should show `Knox bot online` and `/ask registered`. That's it: nothing to run on your computer.

The bot doesn't need a public URL or a port; it connects out to Discord.

**Cost:** Railway's Hobby plan is $5/month and includes $5 of usage. A bot this size uses well under that, so expect **about $5/month**. Check railway.com/pricing for current prices.

## Tests

```bash
npm test
```
