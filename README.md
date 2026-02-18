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
git clone https://github.com/sipaldrop/JuneAiBot-Sipal.git
cd JuneAiBot-Sipal
```

2. **Install dependencies**
```bash
npm install
```

3. **Prepare Configuration**
Copy the template file to create your configuration:
```bash
cp accounts_tmp.json accounts.json
```
*(On Windows, you can just manually copy and rename the file)*

4. **Configure Groq API (Optional but Recommended)**
Open `accounts.json` and add your Groq API keys to the `groqApiKey` array. This improves the AI's ability to generate unique questions.
```json
{
  "groqApiKey": [
    "gsk_your_key_here",
    "gsk_another_key_optional"
  ],
  "accounts": [ ... ]
}
```

5. **Get Session & Cookie (Automatic)**
Run the session grabber tool to log in and save your session automatically.
   
- **For a single account (e.g., Account 1):**
  ```bash
  node grab_session.js 1
  ```
- **For all accounts sequentially:**
  ```bash
  node grab_session.js --all
  ```

**Instructions:**
- A Chrome window will open.
- Log in to your AskJune account.
- Once logged in, the tool will automatically detect your session, save it to `accounts.json`, and close the browser.
- **Note:** This session is saved permanently in `browser_profiles/`, so you don't need to log in again unless your session expires.

6. **Run the Bot**
Start the main bot:
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
