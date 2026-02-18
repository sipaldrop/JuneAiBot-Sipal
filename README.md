# 🤖 SIPAL JUNE AI V1.0

> AskJune.ai Auto Chat Bot — Earn points by chatting with AI

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔒 **Privacy+ Mode** | Sends chats with Privacy+ enabled |
| 🤖 **All Models** | Cycles through every available model |
| 🔀 **AutoRouter** | Tests all router strategies (Balanced, Speed, Quality) |
| 📤 **Share Chat** | Shares a chat for bonus points |
| 💰 **Smart Credits** | Stops automatically when credits reach 0 |
| 🏆 **Real Points** | Fetches and displays actual points from API |
| 🔄 **Session KeepAlive** | Refreshes session every 30 min (24/7) |
| 👥 **Multi-Account** | Supports unlimited accounts |
| ⏰ **Daily Schedule** | Runs every day at 8:00 AM WIB |

## 📋 Requirements

- [Node.js](https://nodejs.org/) v18+
- [Groq API Key](https://console.groq.com/) (optional, for smart prompts)

## 🚀 Setup

1. **Clone the repository**
```bash
git clone https://github.com/sipal-airdrop/JuneAiBot-Sipal.git
cd JuneAiBot-Sipal
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure accounts**
```bash
cp accounts_tmp.json accounts.json
```
Edit `accounts.json` with your credentials:
```json
[
  {
    "name": "Account-1",
    "session_id": "YOUR_SESSION_ID",
    "cookie": "YOUR_FULL_COOKIE_STRING",
    "groqApiKey": ["YOUR_GROQ_KEY"],
    "proxy": ""
  }
]
```

4. **Get Session & Cookie** (Multi-Profile Support)
   
   This tool uses persistent Chrome Profiles, so you stay logged in!
   
   - **Specific Account** (e.g. Account 1):
     ```bash
     node grab_session.js 1
     ```
   - **Run All Accounts** (Sequential):
     ```bash
     node grab_session.js --all
     ```

   Login to `askjune.ai` in the window. Once logged in, the window closes automatically and saves the session. Next time, just run it again to refresh cookies without re-typing password!

5. **Configure Groq Keys**
   Open `accounts.json` and add your keys to the `groqApiKey` array at the top:
   ```json
   {
     "groqApiKey": [
       "YOUR_GROQ_KEY_1",
       "YOUR_GROQ_KEY_2"
     ],
     "accounts": [ ... ]
   }
   ```

6. **Run the bot**
```bash
node index.js
```

## 📁 Project Structure

```
├── index.js              # Main bot (V1.0)
├── grab_session.js        # Puppeteer session extractor
├── accounts.json          # Your accounts (gitignored)
├── accounts_tmp.json      # Template
├── device_fingerprints.json # Auto-generated (gitignored)
├── package.json
├── LICENSE
└── README.md
```

## ⚙️ Configuration

Edit constants at the top of `index.js`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_RUN_HOUR` | `8` | Daily run hour (WIB) |
| `DELAY_BETWEEN_CHATS` | `[5000, 15000]` | Random delay between chats (ms) |
| `SESSION_KEEPALIVE_MS` | `1800000` | Session refresh interval (30 min) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model for prompt generation |

## 📄 License

MIT License — See [LICENSE](LICENSE)

## ⚠️ Disclaimer

This bot is for educational purposes only. Use at your own risk. The author is not responsible for any consequences of using this software.

---

**Made with ❤️ by Sipal Airdrop**
