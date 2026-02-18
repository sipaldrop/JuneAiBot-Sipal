/**
 * grab_session.js — Multi-Profile Session Grabber for June AI
 * 
 * Usage: 
 *   node grab_session.js [account_index]
 *   node grab_session.js --all
 * 
 * Features:
 * - Persistent Chrome Profiles (cookies saved in ./browser_profiles/)
 * - No need to re-login repeatedly (unless session expired)
 * - Auto-updates accounts.json
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ACCOUNTS_PATH = path.join(__dirname, 'accounts.json');
const PROFILES_DIR = path.join(__dirname, 'browser_profiles');
const TARGET_URL = 'https://askjune.ai/app/chat';

// Ensure profiles dir exists
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });

async function loadAccounts() {
    if (!fs.existsSync(ACCOUNTS_PATH)) {
        console.error('❌ accounts.json not found!');
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf-8'));
    const accounts = Array.isArray(raw) ? raw : (raw.accounts || []);
    const fullData = Array.isArray(raw) ? { accounts: raw, groqApiKey: [] } : raw;
    return { accounts, fullData };
}

async function grabForAccount(accountIndex, totalAccounts) {
    const { accounts, fullData } = await loadAccounts();

    if (accountIndex < 0 || accountIndex >= accounts.length) return false;

    const acc = accounts[accountIndex];
    const accName = acc.name || `Account-${accountIndex + 1}`;
    const safeName = accName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const profilePath = path.join(PROFILES_DIR, safeName);

    console.log(`\n════════════════════════════════════════════════════════════`);
    console.log(`👤 Processing: ${accName} (${accountIndex + 1}/${totalAccounts})`);
    console.log(`📂 Profile: ${profilePath}`);
    console.log(`════════════════════════════════════════════════════════════`);

    const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,900',
        '--ignore-certificate-errors',
        '--enable-features=NetworkService,NetworkServiceInProcess',
    ];

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: profilePath,
        ignoreHTTPSErrors: true,
        args: launchArgs
    });

    try {
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();

        browser.on('disconnected', () => {
            console.log('⚠️ Browser closed manually.');
            // process.exit(0); // Don't exit process if running --all
        });

        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

        console.log('📌 Silakan Login manual (Email/OTP).');
        console.log('   Kalau sudah pernah login, dia akan masuk otomatis.');
        console.log('⏳ Menunggu session aktif (Login detected)...');

        // POLL FOR AUTHENTICATED STATE
        let attempts = 0;
        const MAX_ATTEMPTS = 600; // 10 minutes
        let client = null;

        try { client = await page.createCDPSession(); } catch (e) { return false; }

        while (attempts < MAX_ATTEMPTS) {
            attempts++;
            await new Promise(r => setTimeout(r, 1000));

            // Check if browser is still open
            if (browser.isConnected() === false) {
                console.log('❌ Browser closed.');
                return false;
            }

            // Check login state via DOM (Guest Mode Check)
            let isGuest = true;
            try {
                isGuest = await page.evaluate(() => {
                    // Check for "Sign in" or "Get started"
                    const txt = document.body.innerText;
                    const hasSignIn = txt.includes('Sign in') || txt.includes('Get Started');
                    // AskJune specific: Guest label?
                    const hasGuestLabel = document.querySelector('[data-testid="guest-label"]'); // hypothetical

                    // If we see "New Chat" and "Privacy+ Mode" usually implies logged in?
                    const hasNewChat = document.body.innerText.includes('New Chat');

                    if (hasNewChat && !hasSignIn && !hasGuestLabel) return false; // Logged in
                    return true; // Still guest
                });
            } catch (e) {
                // Page might be closed/navigating
                continue;
            }

            if (isGuest) {
                if (attempts % 5 === 0) process.stdout.write('.');
                continue;
            }

            // LOGGED IN
            console.log(`\n✅ Login OK! Menyimpan session...`);

            try {
                const { cookies } = await client.send('Network.getAllCookies');
                const juneCookies = cookies.filter(c => c.domain.includes('askjune.ai'));
                const sessionCookie = juneCookies.find(c => c.name === 'session_id');

                if (sessionCookie) {
                    const cookieStr = juneCookies.map(c => `${c.name}=${c.value}`).join('; ');

                    // Reload to ensure fresh data
                    const { fullData: current } = await loadAccounts();

                    current.accounts[accountIndex].cookie = cookieStr;
                    current.accounts[accountIndex].session_id = sessionCookie.value;

                    const devId = juneCookies.find(c => c.name === 'device_id');
                    if (devId) current.accounts[accountIndex].device_id = devId.value;

                    fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(current, null, 2));
                    console.log(`💾 Saved to accounts.json!`);

                    await new Promise(r => setTimeout(r, 1000));
                    await browser.close();
                    return true;
                }
            } catch (e) {
                console.log('Error getting cookies (browser closed?):', e.message);
                return false;
            }
        }

        console.log('\n❌ Timeout.');
        await browser.close();
        return false;

    } catch (e) {
        // console.error('Error:', e);
        try { await browser.close(); } catch { }
        return false;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const { accounts } = await loadAccounts();

    if (args.includes('--all')) {
        for (let i = 0; i < accounts.length; i++) {
            await grabForAccount(i, accounts.length);
            await new Promise(r => setTimeout(r, 2000));
        }
    } else {
        let idx = 0;
        if (args.length > 0 && !isNaN(args[0])) idx = parseInt(args[0]) - 1;

        if (idx >= accounts.length) {
            console.log(`✨ Creating Account ${idx + 1}...`);
            while (accounts.length <= idx) {
                accounts.push({ name: `Account-${accounts.length + 1}`, session_id: "" });
            }
            const { fullData } = await loadAccounts();
            fullData.accounts = accounts;
            fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(fullData, null, 2));
        }
        await grabForAccount(idx, accounts.length);
    }
    console.log('\n🤖 Done!');
}

main();
