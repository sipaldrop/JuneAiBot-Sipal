// ═══════════════════════════════════════════════════════════
// SIPAL JUNE AI V1.0 — by Sipal Airdrop
// AskJune.ai Auto Chat Bot — Earn points by chatting
// Features: Daily Tasks, Smart Credits, Session KeepAlive
// ═══════════════════════════════════════════════════════════

const { gotScraping } = require('got-scraping');
const chalk = require('chalk');
const Table = require('cli-table3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const DELAY_BETWEEN_CHATS = [5000, 15000];
const DELAY_BETWEEN_ACCOUNTS = [3000, 8000];
const DAILY_RUN_HOUR = 8; // 8 AM WIB
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const LOG_LIMIT = 20;
const TABLE_REFRESH_MS = 2000;
const MAX_RETRIES = 3;
const RATE_LIMIT_WAIT = 60000;
const SESSION_KEEPALIVE_MS = 30 * 60 * 1000; // 30 minutes
const MAX_KEEPALIVE_FAILS = 3;

// ═══════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://askjune.ai';
const API = {
    MODELS: `${BASE_URL}/api/models`,
    ROUTE: `${BASE_URL}/api/models/route`,
    POINTS: `${BASE_URL}/api/account/points`,
    CREDITS: `${BASE_URL}/api/account/credits`,
    CHAT: `${BASE_URL}/api/chat`,
    SHARE: `${BASE_URL}/api/chat/shared`,
    VERSION: `${BASE_URL}/api/version`,
    AUTH_REFRESH: `${BASE_URL}/api/auth/refresh`,
};
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';



// ═══════════════════════════════════════════════════════════
// PATHS
// ═══════════════════════════════════════════════════════════

const ACCOUNTS_PATH = path.join(__dirname, 'accounts.json');
const FINGERPRINTS_PATH = path.join(__dirname, 'device_fingerprints.json');

// ═══════════════════════════════════════════════════════════
// FALLBACK PROMPTS (used when Groq fails)
// ═══════════════════════════════════════════════════════════

const FALLBACK_PROMPTS = [
    "What is the current price of Bitcoin and what factors are influencing it?",
    "Explain the difference between proof of work and proof of stake",
    "How does Ethereum layer 2 scaling work?",
    "What are the top DeFi protocols by TVL?",
    "Explain what NFTs are and their use cases beyond art",
    "How does a crypto wallet work?",
    "What is a DEX and how does it differ from a CEX?",
    "Explain yield farming in DeFi",
    "What are modular blockchains and why do they matter?",
    "How does cross-chain bridging work?",
    "What is the Lightning Network and how does it scale Bitcoin?",
    "Explain tokenomics and why it matters for investors",
    "What are DAOs and how do they govern?",
    "What is MEV in Ethereum and how does it affect users?",
    "Explain the concept of stablecoins and their different types",
    "What is Web3 and how is it different from Web2?",
    "Explain restaking and EigenLayer",
    "What are Real World Assets in crypto?",
    "How does AI intersect with blockchain?",
    "What are Bitcoin ETFs and how do they work?",
    "Explain liquid staking derivatives",
    "What is account abstraction in Ethereum?",
    "How do zero-knowledge proofs work in blockchain?",
    "What is the Solana blockchain and what makes it unique?",
    "Explain the concept of gas fees in different blockchains",
];

// ═══════════════════════════════════════════════════════════
// GLOBAL STATE & DASHBOARD
// ═══════════════════════════════════════════════════════════

const state = {
    accounts: [],
    logs: [],
    isRunning: true,
    nextGlobalRun: null,
    keepaliveActive: false,
};

let globalGroqKeys = [];

let renderInterval = null;

function logToState(msg) {
    const cleanMsg = msg.replace(/\s+/g, ' ').trim();
    state.logs.push(cleanMsg);
    if (state.logs.length > LOG_LIMIT) state.logs.shift();
}

const L = {
    info: (m, c) => logToState(`[${ts()}] ${chalk.blue('ℹ')}  [${pad(c)}] ${m}`),
    ok: (m, c) => logToState(`[${ts()}] ${chalk.green('✔')}  [${pad(c)}] ${m}`),
    warn: (m, c) => logToState(`[${ts()}] ${chalk.yellow('⚠')}  [${pad(c)}] ${m}`),
    err: (m, c) => logToState(`[${ts()}] ${chalk.red('✖')}  [${pad(c)}] ${m}`),
    chat: (m, c) => logToState(`[${ts()}] ${chalk.cyan('💬')} [${pad(c)}] ${m}`),
    pts: (m, c) => logToState(`[${ts()}] ${chalk.yellow('💎')} [${pad(c)}] ${m}`),
    brain: (m, c) => logToState(`[${ts()}] ${chalk.magenta('🧠')} [${pad(c)}] ${m}`),
    credit: (m, c) => logToState(`[${ts()}] ${chalk.green('�')} [${pad(c)}] ${m}`),
    task: (m, c) => logToState(`[${ts()}] ${chalk.white('📋')} [${pad(c)}] ${m}`),
    keep: (m, c) => logToState(`[${ts()}] ${chalk.gray('🔄')} [${pad(c)}] ${m}`),
};

function ts() { return new Date().toLocaleTimeString('en-US', { hour12: false }); }
function pad(s, n = 14) { return (s || '').padEnd(n).substring(0, n); }

// ═══════════════════════════════════════════════════════════
// UI RENDERER
// ═══════════════════════════════════════════════════════════

function fmtDate(ts) {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

function fmtDur(ms) {
    if (ms <= 0) return '0s';
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    return `${h ? h + 'h ' : ''}${m ? m + 'm ' : ''}${s}s`;
}

function renderTable() {
    const t = new Table({
        head: ['Account', 'Status', 'Points', 'Credits', 'Chats', 'Tasks', 'Last Run', 'Next Run'],
        colWidths: [14, 14, 10, 10, 8, 16, 16, 16],
        style: { head: ['cyan'] },
    });

    for (const a of state.accounts) {
        const nr = a.status === 'IDLE' && state.nextGlobalRun
            ? fmtDur(state.nextGlobalRun - Date.now())
            : (a.nextRun ? fmtDur(a.nextRun - Date.now()) : '-');
        t.push([
            a.name || `Account ${a.index}`,
            a.status,
            a.points >= 0 ? a.points : '?',
            a.credits >= 0 ? a.credits : '?',
            a.chats || 0,
            a.tasks || '-',
            fmtDate(a.lastRun),
            nr,
        ]);
    }

    const logo = `
                   / \\
                  /   \\
                 |  |  |
                 |  |  |
                  \\  \\
                 |  |  |
                 |  |  |
                  \\   /
                   \\ /

      ======SIPAL AIRDROP======
    =====SIPAL JUNE AI V1.0=====
`;

    process.stdout.write('\x1Bc');
    process.stdout.write(logo);
    process.stdout.write(t.toString() + '\n');

    const logBlock = state.logs.slice(-LOG_LIMIT).join('\n');
    process.stdout.write(' EXECUTION LOGS:\n');
    process.stdout.write(logBlock + '\n');
    process.stdout.write('═'.repeat(80) + '\n');
}

function startDash() { renderInterval = setInterval(renderTable, TABLE_REFRESH_MS); renderTable(); }
function stopDash() { if (renderInterval) clearInterval(renderInterval); }

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

const rndDelay = ([min, max]) => min + Math.floor(Math.random() * (max - min));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const trunc = (s, n = 60) => s && s.length > n ? s.substring(0, n) + '...' : (s || '');

// ═══════════════════════════════════════════════════════════
// DEVICE FINGERPRINT MANAGER
// ═══════════════════════════════════════════════════════════

function loadFP() { try { return JSON.parse(fs.readFileSync(FINGERPRINTS_PATH, 'utf-8')); } catch { return {}; } }
function saveFP(fp) { fs.writeFileSync(FINGERPRINTS_PATH, JSON.stringify(fp, null, 2)); }

function getDeviceId(name) {
    const fp = loadFP();
    if (fp[name]) return fp[name];
    const id = crypto.randomUUID();
    fp[name] = id;
    saveFP(fp);
    return id;
}

// ═══════════════════════════════════════════════════════════
// ACCOUNTS LOADER
// ═══════════════════════════════════════════════════════════

function loadAccounts() {
    if (!fs.existsSync(ACCOUNTS_PATH)) {
        console.log(chalk.red('✖ accounts.json not found! Copy accounts_tmp.json → accounts.json'));
        process.exit(1);
    }
    const rawData = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf-8'));

    // Handle both array (legacy) and object (new) structure
    let accountsRaw = [];
    if (Array.isArray(rawData)) {
        accountsRaw = rawData;
    } else if (rawData.accounts) {
        accountsRaw = rawData.accounts;
        if (Array.isArray(rawData.groqApiKey)) {
            globalGroqKeys = rawData.groqApiKey;
        }
    }

    const valid = accountsRaw.filter(a => {
        if (!a.session_id || a.session_id.includes('YOUR_')) {
            console.log(chalk.yellow(`⚠ Skipping ${a.name || 'unnamed'}: invalid session_id`));
            return false;
        }
        return true;
    });

    if (valid.length === 0) {
        console.log(chalk.red('✖ No valid accounts! Add session_id to accounts.json.'));
        process.exit(1);
    }

    // Log loaded keys
    if (globalGroqKeys.length > 0) {
        console.log(chalk.cyan(`🔑 Loaded ${globalGroqKeys.length} global Groq API keys`));
    } else {
        console.log(chalk.yellow('⚠ No Groq API keys found in accounts.json (root "groqApiKey")'));
    }

    return valid.map((a, i) => {
        const name = a.name || `Account-${i + 1}`;
        let devId = getDeviceId(name);

        // Extract device_id from cookie if present
        if (a.cookie) {
            const m = a.cookie.match(/(?:^|;\s*)device_id=([^;]+)/);
            if (m && m[1]) {
                devId = m[1];
                const fp = loadFP();
                if (fp[name] !== devId) { fp[name] = devId; saveFP(fp); }
            }
        }

        return {
            ...a,
            name,
            device_id: devId,
            cfBm: '',
        };
    });
}

// ═══════════════════════════════════════════════════════════
// HTTP CLIENT (got-scraping for Cloudflare bypass)
// ═══════════════════════════════════════════════════════════

function buildCookie(acc) {
    if (acc.cookie) {
        let c = acc.cookie;
        // Update session_id in cookie string
        if (acc.session_id && c.includes('session_id=')) {
            c = c.replace(/session_id=[^;]+/, `session_id=${acc.session_id}`);
        }
        // Append/update Cloudflare cookie
        if (acc.cfBm) {
            if (c.includes('__cf_bm=')) c = c.replace(/__cf_bm=[^;]+/, `__cf_bm=${acc.cfBm}`);
            else c += `; __cf_bm=${acc.cfBm}`;
        }
        return c;
    }
    // Fallback
    const parts = [
        `device_id=${acc.device_id}`,
        `session_id=${acc.session_id}`,
        `dark_mode=true`,
        `preferred_auto_router_enabled=true`,
        `preferred_chat_model_id=blockchain/june`,
    ];
    if (acc.cfBm) parts.push(`__cf_bm=${acc.cfBm}`);
    return parts.join('; ');
}

function baseHeaders(acc, method = 'GET') {
    const headers = {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': buildCookie(acc),
        'Referer': `${BASE_URL}/app/chat`,
        'sec-ch-prefers-color-scheme': 'dark',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'User-Agent': acc.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    };
    if (method !== 'GET') {
        headers['Origin'] = BASE_URL;
    }
    return headers;
}

function extractCookies(res, acc) {
    const sc = res.headers?.['set-cookie'];
    if (!sc) return;
    const cookies = Array.isArray(sc) ? sc : [sc];

    function updateCookieStr(key, val) {
        if (!acc.cookie) return;
        const re = new RegExp(`${key}=[^;]+`);
        if (acc.cookie.match(re)) {
            acc.cookie = acc.cookie.replace(re, `${key}=${val}`);
        } else {
            acc.cookie += `; ${key}=${val}`;
        }
    }

    let updated = false;

    for (const c of cookies) {
        // session_id
        const sm = c.match(/session_id=([^;]+)/);
        if (sm && acc.session_id !== sm[1]) {
            acc.session_id = sm[1];
            updateCookieStr('session_id', sm[1]);
            updated = true;
        }
        // __cf_bm  
        const cm = c.match(/__cf_bm=([^;]+)/);
        if (cm) {
            acc.cfBm = cm[1];
            updateCookieStr('__cf_bm', cm[1]);
            // cf_bm changes often, maybe don't save every time? 
            // excessive writes. Let's only save if session_id changes or it's critical.
            // Actually, let's allow it for now, 30 min is fine.
            updated = true;
        }
        // device_id
        const dm = c.match(/device_id=([^;]+)/);
        if (dm && acc.device_id !== dm[1]) {
            acc.device_id = dm[1];
            updateCookieStr('device_id', dm[1]);
            updated = true;
        }
    }
    if (updated) saveAccounts();
}

async function apiGet(url, acc) {
    const opts = {
        url,
        headers: baseHeaders(acc, 'GET'),
        responseType: 'json',
        throwHttpErrors: false,
    };
    if (acc.proxy) opts.proxyUrl = acc.proxy;
    const res = await gotScraping(opts);
    extractCookies(res, acc);
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode} GET ${url}`);
    return res.body;
}

async function apiPost(url, acc, body = undefined) {
    const opts = {
        url,
        method: 'POST',
        headers: {
            ...baseHeaders(acc, 'POST'),
            'Content-Type': 'application/json',
        },
        responseType: 'json',
        throwHttpErrors: false,
    };
    if (acc.proxy) opts.proxyUrl = acc.proxy;
    if (body) opts.body = JSON.stringify(body);
    const res = await gotScraping(opts);
    extractCookies(res, acc);
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode} POST ${url}`);
    return res.body;
}



function saveAccounts() {
    try {
        // Safe mapping
        const cleanAccounts = state.accounts.map(a => ({
            name: a.name,
            session_id: a.session_id,
            cookie: a.cookie,
            proxy: a.proxy,
            device_id: a.device_id
        }));

        const data = {
            groqApiKey: globalGroqKeys,
            accounts: cleanAccounts,
        };

        const fs = require('fs');
        const path = require('path');
        fs.writeFileSync(path.join(__dirname, 'accounts.json'), JSON.stringify(data, null, 2));
    } catch (e) { L.err(`Save accounts fail: ${e.message}`, 'System'); }
}

async function apiPut(url, acc, body) {
    const opts = {
        url: url,
        method: 'PUT',
        headers: baseHeaders(acc, 'PUT'),
        body: JSON.stringify(body),
        responseType: 'json',
        throwHttpErrors: false,
        timeout: { request: 30000 },
        retry: { limit: 1 }, // Retry once
    };
    if (acc.proxy) opts.proxyUrl = acc.proxy;
    const res = await gotScraping(opts);
    extractCookies(res, acc);
    if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode} PUT ${url}`);
    return res.body;
}

// ═══════════════════════════════════════════════════════════
// GROQ PROMPT GENERATOR
// ═══════════════════════════════════════════════════════════

async function genPrompt(groqKeys, ctx) {
    const key = Array.isArray(groqKeys) ? pick(groqKeys) : groqKeys;
    try {
        const categories = [
            'DeFi protocols', 'NFT marketplaces', 'Layer 2 scaling', 'crypto wallets',
            'blockchain gaming', 'DAO governance', 'DEX trading', 'yield farming',
            'staking mechanisms', 'cross-chain bridges', 'crypto regulations',
            'Bitcoin mining', 'Ethereum upgrades', 'stablecoins', 'tokenomics',
            'modular blockchains', 'zero-knowledge proofs', 'MEV', 'restaking',
            'real world assets', 'AI and blockchain', 'crypto ETFs',
        ];
        const cat = pick(categories);
        const res = await gotScraping({
            url: GROQ_API_URL,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: 'Generate a single, natural crypto question (15-30 words). No numbering, no quotes. Just the question.' },
                    { role: 'user', content: `Generate a question about ${cat}` },
                ],
                max_tokens: 80,
                temperature: 0.9,
            }),
            responseType: 'json',
            throwHttpErrors: false,
            timeout: { request: 15000 },
        });
        if (res.statusCode === 200 && res.body?.choices?.[0]?.message?.content) {
            const prompt = res.body.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
            L.brain(`Groq → ${trunc(prompt, 50)}`, ctx);
            return prompt;
        }
        L.warn(`Groq fail: ${res.statusCode}, fallback`, ctx);
    } catch (e) {
        L.warn(`Groq err: ${trunc(e.message, 40)}, fallback`, ctx);
    }
    return pick(FALLBACK_PROMPTS);
}

// ═══════════════════════════════════════════════════════════
// JUNE AI API
// ═══════════════════════════════════════════════════════════

async function warmup(acc, ctx) {
    L.info('Cloudflare warmup...', ctx);
    const data = await apiGet(API.VERSION, acc);
    L.ok(`Build: ${data.buildId || 'unknown'}`, ctx);
}

async function refreshSession(acc, ctx) {
    try {
        const data = await apiPost(API.AUTH_REFRESH, acc);
        if (data.success) {
            L.ok(`Session refreshed (expires: ${new Date(parseInt(data.expires_at)).toLocaleDateString()})`, ctx);
            return true;
        }
        L.warn('Session refresh returned no success', ctx);
        return false;
    } catch (e) {
        L.warn(`Session refresh fail: ${e.message}`, ctx);
        return false;
    }
}

async function getPoints(acc) {
    try {
        const data = await apiGet(API.POINTS, acc);
        if (data && typeof data.points === 'number') return data.points;
        if (data && typeof data.totalPoints === 'number') return data.totalPoints;
        // If we get here, format is unknown but maybe not critical if we got 200 OK
        return -1;
    } catch (e) {
        // 403 means we can't see points, but might still be able to chat
        if (e.message.includes('403')) return -1;
        L.warn(`getPoints error: ${trunc(e.message, 40)}`, 'System');
        return -1;
    }
}

async function getCredits(acc) {
    try {
        const data = await apiGet(API.CREDITS, acc);

        // Handle new structure: { usageWindow: { remaining: "3.65" } }
        if (data?.usageWindow?.remaining) return parseFloat(data.usageWindow.remaining);
        if (data?.prepaid?.remaining) return parseFloat(data.prepaid.remaining);

        if (data && typeof data.remaining === 'number') return data.remaining;
        if (data && typeof data.credits === 'number') return data.credits;

        L.warn(`getCredits: Unexpected format: ${JSON.stringify(data)}`, 'System');
        return -1;
    } catch (e) {
        L.warn(`getCredits error: ${trunc(e.message, 40)}`, 'System');
        return -1;
    }
}

// ═══════════════════════════════════════════════════════════
// MODEL DATABASE (full metadata for chat persistence)
// ═══════════════════════════════════════════════════════════

const MODELS = {
    'blockchain/june': {
        type: 'CHAT', id: 'blockchain/june',
        label: 'June GPT OSS', shortLabel: 'June',
        description: 'Crypto Expert',
        iconUrl: 'https://login.blockchain.com/static/asset/icon/ai_icons/labs/June.png',
        darkIconUrl: 'https://login.blockchain.com/static/asset/icon/ai_icons/labs/June_dark.png',
        isOpenWeights: true,
        tools: ['brave_web_search', 'generate_image', 'get_crypto_chart', 'get_crypto_info', 'get_crypto_top_movers', 'get_june_ui_documentation', 'get_stock_info', 'get_top_cryptos_by_market_cap', 'get_transaction_details', 'get_wallet_history', 'get_wallet_portfolio', 'read_web_page', 'resolve_ens_domain'],
        samplePrompts: [],
        inputs: { text: { supported: true }, image: { supported: false }, file: { supported: true, pdf: { supported: true, nativeSupport: false, maxBytesTotal: 20000000 }, text: { supported: true } }, audio: { supported: false } },
        isHealthy: true, minimumUserTier: null, isDeprecated: false,
    },
    'deepseek/deepseek-chat-v3.2': {
        type: 'CHAT', id: 'deepseek/deepseek-chat-v3.2',
        label: 'DeepSeek V3.2', shortLabel: 'DeepSeek',
        description: 'Advanced reasoning model',
        iconUrl: 'https://login.blockchain.com/static/asset/icon/ai_icons/labs/DeepSeek.png',
        isOpenWeights: true, tools: [],
        samplePrompts: [],
        inputs: { text: { supported: true }, image: { supported: false }, file: { supported: false }, audio: { supported: false } },
        isHealthy: true, minimumUserTier: null, isDeprecated: false,
    },
    'meta/llama-4-maverick': {
        type: 'CHAT', id: 'meta/llama-4-maverick',
        label: 'Llama 4 Maverick', shortLabel: 'Llama4',
        description: 'Meta open model',
        iconUrl: 'https://login.blockchain.com/static/asset/icon/ai_icons/labs/Meta.png',
        isOpenWeights: true, tools: [],
        samplePrompts: [],
        inputs: { text: { supported: true }, image: { supported: false }, file: { supported: false }, audio: { supported: false } },
        isHealthy: true, minimumUserTier: null, isDeprecated: false,
    },
    'qwen/qwen-3': {
        type: 'CHAT', id: 'qwen/qwen-3',
        label: 'Qwen 3', shortLabel: 'Qwen3',
        description: 'Alibaba reasoning model',
        iconUrl: 'https://login.blockchain.com/static/asset/icon/ai_icons/labs/Qwen.png',
        isOpenWeights: true, tools: [],
        samplePrompts: [],
        inputs: { text: { supported: true }, image: { supported: false }, file: { supported: false }, audio: { supported: false } },
        isHealthy: true, minimumUserTier: null, isDeprecated: false,
    },
    'google/gemini-2.5-flash': {
        type: 'CHAT', id: 'google/gemini-2.5-flash',
        label: 'Gemini 2.5 Flash', shortLabel: 'Gemini',
        description: 'Google fast model',
        iconUrl: 'https://login.blockchain.com/static/asset/icon/ai_icons/labs/Google.png',
        isOpenWeights: false, tools: [],
        samplePrompts: [],
        inputs: { text: { supported: true }, image: { supported: true }, file: { supported: false }, audio: { supported: false } },
        isHealthy: true, minimumUserTier: null, isDeprecated: false,
    },
};

const ALL_MODEL_IDS = Object.keys(MODELS);
const ALL_MODELS_ARRAY = Object.values(MODELS);

// ═══════════════════════════════════════════════════════════
// CHAT (API Route — POST /api/chat)
// ═══════════════════════════════════════════════════════════

function genMsgId() {
    return 'msg-' + Math.random().toString(36).substr(2, 9);
}

// ═══════════════════════════════════════════════════════════
// REALTIME STATS HELPER
// ═══════════════════════════════════════════════════════════

async function updateStats(acc, s, c) {
    try {
        const [pts, cre] = await Promise.all([
            getPoints(acc),
            getCredits(acc)
        ]);

        // Only update if valid
        if (pts !== -1) {
            if (pts !== s.points && s.points !== -1) {
                const diff = pts - s.points;
                if (diff !== 0) L.pts(`Points: ${pts} (${diff > 0 ? '+' : ''}${diff})`, c);
            }
            s.points = pts;
        }

        if (cre !== -1) {
            s.credits = cre;
        }
    } catch (e) {
        L.warn(`Stats update error: ${e.message}`, c);
    }
}


async function sendChat(acc, modelId, prompt, opts = {}) {
    const chatId = genMsgId();
    const msgId = genMsgId();
    const now = new Date().toISOString();
    const sortIndex = Date.now();

    const selectedModel = MODELS[modelId] || MODELS['blockchain/june'];

    const systemPrompt = "The user user doesn't have wallet connected. If user asks about wallet, tell them to connect by clicking on this markdown link: [Connect Wallet](/app/settings/social-signin).";

    const chatDetails = {
        enableReasoning: opts.enableReasoning || false,
        isPrivateMode: opts.isPrivateMode || false,
        isAutoRouterSelected: opts.isAutoRouterSelected || false,
        selectedModel: selectedModel,
        models: ALL_MODELS_ARRAY,
        systemPrompt: systemPrompt,
        isVerified: false,
        selectedRouterStrategyType: opts.strategyType || 'BALANCED',
        selectedModalityType: 'CHAT',
        userTier: 'FREE',
        id: chatId,
        messages: [{
            chatId: chatId,
            id: msgId,
            createdAt: now,
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
            metadata: { sortIndex },
        }],
        trigger: 'submit-message',
    };

    const res = await gotScraping({
        url: API.CHAT,
        method: 'POST',
        headers: {
            ...baseHeaders(acc),
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Referer': `${BASE_URL}/app/chat?id=${chatId}`,
        },
        body: JSON.stringify(chatDetails),
        responseType: 'text',
        throwHttpErrors: false,
        timeout: { request: 120000 },
    });

    extractCookies(res, acc);

    if (res.statusCode !== 200) {
        throw new Error(`Chat HTTP ${res.statusCode}: ${trunc(typeof res.body === 'string' ? res.body : '', 150)}`);
    }

    const rawBody = typeof res.body === 'string' ? res.body : '';
    const responseText = parseSSE(rawBody);

    return { chatId, msgId, response: responseText, rawBody };
}

function parseSSE(text) {
    let full = '';
    const lines = text.split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith('data:')) {
            const d = line.substring(5).trim();
            if (d === '[DONE]') continue;
            try {
                const p = JSON.parse(d);
                if (p.type === 'data-error' && p.data?.error) {
                    const errId = p.data.error.id || '';
                    const errMsg = p.data.error.message || 'Unknown error';
                    if (errId === 'INVALID_TOKEN' || errId === 'UNAUTHORIZED') throw new Error(`401 INVALID_TOKEN: ${errMsg}`);
                    if (errId === 'UNSUPPORTED_MODEL') throw new Error(`UNSUPPORTED_MODEL: ${errMsg}`);
                    if (errId === 'CREDIT_LIMIT_EXCEEDED' || errMsg.includes('limit')) throw new Error(`CREDIT_LIMIT_EXCEEDED: ${errMsg}`);
                    throw new Error(`Stream error [${errId}]: ${errMsg}`);
                }
                if (p.type === 'error') {
                    const et = p.errorText || 'Unknown';
                    if (et.includes('Bad Request')) throw new Error(`MODEL_ERROR: ${et}`); // 401 Bad Request is usually model error
                    throw new Error(`401 Stream error: ${et}`);
                }
                if (p.type === 'text-delta' && p.delta) full += p.delta;
                else if (p.choices?.[0]?.delta?.content) full += p.choices[0].delta.content;
                else if (p.text) full += p.text;
            } catch (e) {
                if (e.message.includes('401') || e.message.includes('INVALID_TOKEN') || e.message.includes('Stream error')) throw e;
            }
        }
        else if (line.startsWith('0:')) {
            try {
                const c = line.substring(2).trim();
                if (c.startsWith('"') && c.endsWith('"')) full += JSON.parse(c);
            } catch (_) { }
        }
    }
    return full || '(empty response)';
}

// ═══════════════════════════════════════════════════════════
// SHARE CHAT (PUT /api/chat/shared)
// ═══════════════════════════════════════════════════════════

async function shareChat(acc, chatId, messages, ctx) {
    try {
        const chatPayload = JSON.stringify({
            id: chatId,
            messages: messages,
            createdAt: new Date().toISOString(),
        });
        // Encode as base64 (the browser uses encryption, but base64 works as encryptedContent)
        const encoded = Buffer.from(chatPayload).toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const data = await apiPut(API.SHARE, acc, { encryptedContent: encoded });
        if (data.chatId) {
            L.ok(`Chat shared! ID: ${trunc(data.chatId, 20)}`, ctx);
            return true;
        }
        L.warn('Share returned unexpected response', ctx);
        return false;
    } catch (e) {
        L.warn(`Share fail: ${trunc(e.message, 50)}`, ctx);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════
// DAILY TASKS PROCESSOR
// ═══════════════════════════════════════════════════════════

async function processAccount(acc, idx) {
    const c = `Account ${idx}`;
    const s = state.accounts[idx - 1];
    s.status = 'PROCESSING';
    s.chats = 0;
    const completedTasks = [];

    // Helper to update stats after action
    const postAction = async () => await updateStats(acc, s, c);

    try {
        // 1. Warmup
        await warmup(acc, c);

        // 2. Refresh session
        const refreshOk = await refreshSession(acc, c);
        if (!refreshOk) {
            L.err('Session expired! Update session_id in accounts.json.', c);
            s.status = 'EXPIRED';
            return;
        }

        // 3. Initial points & credits
        const initPts = await getPoints(acc);
        if (initPts >= 0) { s.points = initPts; L.pts(`Points: ${initPts}`, c); }

        const initCredits = await getCredits(acc);
        if (initCredits >= 0) { s.credits = initCredits; L.credit(`Credits: ${initCredits}`, c); }

        if (initCredits === 0) {
            L.warn('No credits remaining! Skipping chats.', c);
            s.status = 'NO_CREDITS';
            s.lastRun = Date.now();
            return;
        }

        let rlRetries = 0;
        const workedModels = ['blockchain/june'];

        // Helper: send one chat and handle result
        async function doChat(modelId, prompt, chatOpts, label) {
            if (s.credits === 0) {
                L.warn('Credits exhausted, stopping.', c);
                return null;
            }

            s.chats = (s.chats || 0) + 1;
            L.chat(`[${s.chats}] ${label}`, c);
            L.info(`Prompt: ${trunc(prompt, 55)}`, c);

            const result = await sendChat(acc, modelId, prompt, chatOpts);
            L.ok(`Response: ${trunc(result.response, 55)}`, c);

            if (!workedModels.includes(modelId)) workedModels.push(modelId);

            // Update stats immediately
            await postAction();
            return result;
        }

        // ─── TASK 1: Privacy+ Mode ───────────────────────
        L.task('Task 1: Privacy+ Mode', c);
        const privPrompt = globalGroqKeys.length ? await genPrompt(globalGroqKeys, c) : pick(FALLBACK_PROMPTS);
        const privResult = await doChat('blockchain/june', privPrompt, { isPrivateMode: true }, 'Privacy+');
        if (privResult) completedTasks.push('Privacy+');
        await sleep(rndDelay(DELAY_BETWEEN_CHATS));

        if (s.credits === 0) { finalize(); return; }

        // ─── TASK 2: Use every model ─────────────────────
        L.task('Task 2: Use Every Model', c);
        let modelSuccess = 0;
        for (const modelId of ALL_MODEL_IDS) {
            if (s.credits === 0) break;

            const modelLabel = MODELS[modelId].shortLabel || MODELS[modelId].label;
            const prompt = acc.groqApiKey ? await genPrompt(acc.groqApiKey, c) : pick(FALLBACK_PROMPTS);
            try {
                await doChat(modelId, prompt, {}, `${modelLabel}`);
                modelSuccess++;
            } catch (e) {
                const em = e.message || '';
                if (em.includes('CREDIT_LIMIT_EXCEEDED')) {
                    s.status = 'NO_CREDITS'; finalize(); return;
                }
                if (em.includes('Payment Required')) {
                    s.status = 'NO_CREDITS (Payment)'; finalize(); return;
                }
                if (em.includes('401') || em.includes('INVALID_TOKEN')) throw e;
                L.warn(`Model ${modelLabel} issue: ${trunc(em, 30)}`, c);
            }
            await sleep(rndDelay(DELAY_BETWEEN_CHATS));
        }
        completedTasks.push(`Models(${modelSuccess}/${ALL_MODEL_IDS.length})`);

        if (s.credits === 0) { finalize(); return; }

        // ─── TASK 3: AutoRouter ──────────────────────────
        L.task('Task 3: AutoRouter', c);
        const strategies = ['BALANCED', 'SPEED', 'QUALITY'];
        for (const strat of strategies) {
            if (s.credits === 0) break;
            const prompt = acc.groqApiKey ? await genPrompt(acc.groqApiKey, c) : pick(FALLBACK_PROMPTS);
            await doChat('blockchain/june', prompt, { isAutoRouterSelected: true, strategyType: strat }, `AR:${strat}`);
            await sleep(rndDelay(DELAY_BETWEEN_CHATS));
        }
        completedTasks.push('AutoRouter');

        if (s.credits === 0) { finalize(); return; }

        // ─── TASK 4: Share a Chat ────────────────────────
        L.task('Task 4: Share a Chat', c);
        const sharePrompt = globalGroqKeys.length ? await genPrompt(globalGroqKeys, c) : pick(FALLBACK_PROMPTS);
        const shareResult = await doChat('blockchain/june', sharePrompt, {}, 'Share');
        if (shareResult) {
            const messages = [{ role: 'user', parts: [{ type: 'text', text: sharePrompt }] }, { role: 'assistant', parts: [{ type: 'text', text: shareResult.response }] }];
            await shareChat(acc, shareResult.chatId, messages, c);
            completedTasks.push('Share');
        }
        await postAction(); // points for sharing?
        await sleep(rndDelay(DELAY_BETWEEN_CHATS));

        // ─── TASK 5: Fill remaining credits ──────────────
        L.task('Task 5: Regular Chats (fill credits)', c);
        let chatCount = 0;
        const maxFill = 50;
        while ((s.credits > 0 || s.credits === -1) && chatCount < maxFill) {
            try {
                const prompt = globalGroqKeys.length ? await genPrompt(globalGroqKeys, c) : pick(FALLBACK_PROMPTS);
                const modelId = pick(workedModels);
                const modelLabel = MODELS[modelId]?.shortLabel || modelId.split('/').pop();

                const result = await doChat(modelId, prompt, { isAutoRouterSelected: Math.random() > 0.5 }, `${modelLabel}`);
                if (!result) break;
                chatCount++;

                if (s.credits > 0) {
                    const d = rndDelay(DELAY_BETWEEN_CHATS);
                    L.info(`Wait ${(d / 1000).toFixed(1)}s...`, c);
                    await sleep(d);
                }
            } catch (e) {
                const em = e.message || String(e);
                if (em.includes('429')) {
                    rlRetries++;
                    if (rlRetries > MAX_RETRIES) { L.err('Rate limit max retries', c); break; }
                    const bk = RATE_LIMIT_WAIT * rlRetries;
                    L.warn(`Rate limited! Wait ${bk / 1000}s`, c);
                    await sleep(bk); continue;
                }
                if (em.includes('CREDIT')) { s.status = 'NO_CREDITS'; break; }
                if (em.includes('Payment Required')) { s.status = 'NO_CREDITS (Payment)'; break; }
                if (em.includes('401')) {
                    const ok = await refreshSession(acc, c);
                    if (!ok) { s.status = 'EXPIRED'; return; }
                    continue;
                }
                if (em.includes('500')) { await sleep(10000); continue; }
                L.err(`Chat err: ${trunc(em, 60)}`, c);
                rlRetries = 0;
                await sleep(5000);
            }
        }

        finalize();

        function finalize() {
            updateStats(acc, s, c);
            s.tasks = completedTasks.join(', ') || '-';
            s.status = s.credits === 0 ? 'DONE (0 CR)' : 'DONE';
            s.lastRun = Date.now();
            L.ok(`Done! ${s.chats} chats | Tasks: ${completedTasks.join(', ')}`, c);
        }

    } catch (e) {
        const em = e.message || String(e);
        L.err(`Error: ${trunc(em, 60)}`, c);
        if (em.includes('Payment Required')) {
            s.status = 'NO_CREDITS (Payment)';
        } else {
            s.status = (em.includes('401') || em.includes('403')) ? 'EXPIRED' : 'FAILED';
        }
        s.lastRun = Date.now();
    }
}

// ═══════════════════════════════════════════════════════════
// SESSION KEEP-ALIVE (runs during idle between daily runs)
// ═══════════════════════════════════════════════════════════

async function sessionKeepAlive(accounts) {
    state.keepaliveActive = true;
    let consecutiveFails = {};
    const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 mins visible heartbeat

    L.info('💗 Session Heartbeat Active (Check every 30m, Pulse every 5m)', 'System');

    let lastRefreshTime = Date.now();

    while (state.keepaliveActive) {
        // Sleep in small chunks to allow interrupt
        const sleepChunk = 60000;
        let elapsed = 0;

        while (elapsed < HEARTBEAT_INTERVAL) {
            await sleep(sleepChunk);
            elapsed += sleepChunk;
            if (!state.keepaliveActive) return;
        }

        // Pulse Check
        const nextRefresh = new Date(lastRefreshTime + SESSION_KEEPALIVE_MS);
        L.keep(`Heartbeat Pulse... All systems operational. Next refresh: ${nextRefresh.toLocaleTimeString()}`, 'System');

        // Check if it's time for real refresh
        if (Date.now() - lastRefreshTime < SESSION_KEEPALIVE_MS) continue;

        // Perform Refresh
        L.info('🔄 Performing scheduled session refresh...', 'System');
        lastRefreshTime = Date.now();

        for (let i = 0; i < accounts.length; i++) {
            const acc = accounts[i];
            const s = state.accounts[i];
            const c = `Account ${i + 1}`;

            if (s.status === 'EXPIRED') continue;

            try {
                // Warmup first
                await apiGet(API.VERSION, acc);
                // Refresh
                const ok = await refreshSession(acc, c);

                // Also update stats during keepalive to keep table fresh!
                await updateStats(acc, s, c);

                if (ok) {
                    consecutiveFails[i] = 0;
                    s.info = 'Session Active';
                    L.keep(`Refreshed OK`, c);
                } else {
                    consecutiveFails[i] = (consecutiveFails[i] || 0) + 1;
                    if (consecutiveFails[i] >= MAX_KEEPALIVE_FAILS) {
                        L.err(`Refresh failed ${MAX_KEEPALIVE_FAILS}x → EXPIRED`, c);
                        s.status = 'EXPIRED';
                    }
                }
            } catch (e) {
                consecutiveFails[i] = (consecutiveFails[i] || 0) + 1;
                L.warn(`Keepalive error: ${trunc(e.message, 40)}`, c);
                if (consecutiveFails[i] >= MAX_KEEPALIVE_FAILS) {
                    s.status = 'EXPIRED';
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════
// SCHEDULE — Next 8 AM WIB
// ═══════════════════════════════════════════════════════════

function getNextRun() {
    const now = new Date();
    const wibOff = 7 * 60;
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const wibNow = new Date(utcMs + (wibOff * 60000));
    const target = new Date(wibNow);
    target.setHours(DAILY_RUN_HOUR, 0, 0, 0);
    if (wibNow >= target) target.setDate(target.getDate() + 1);
    return target.getTime() - (wibOff * 60000) - (now.getTimezoneOffset() * 60000);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function runAll(accounts) {
    state.logs = [];
    state.nextGlobalRun = null;

    L.info('=== New daily run (PARALLEL) ===', 'System');
    L.info(`${accounts.length} accounts | Tasks: Privacy+, Models, AR, Share`, 'System');

    // Run all accounts in parallel
    const promises = accounts.map(async (acc, i) => {
        const idx = i + 1;
        const s = state.accounts[i];

        s.status = 'WAITING';
        s.chats = 0;
        s.tasks = '-';

        // Add random start jitter (0-20s) to avoid thundering herd on API
        const startDelay = Math.floor(Math.random() * 20000);
        await sleep(startDelay);

        L.info(`Starting ${idx}/${accounts.length}...`, `Account ${idx}`);
        L.info(`Device: ${trunc(acc.device_id, 20)}`, `Account ${idx}`);
        if (acc.proxy) L.info(`Proxy: ${acc.proxy.replace(/\/\/.*@/, '//***@')}`, `Account ${idx}`);

        await processAccount(acc, idx);
    });

    await Promise.all(promises);

    const tc = state.accounts.reduce((s, a) => s + (a.chats || 0), 0);
    const ok = state.accounts.filter(a => a.status?.startsWith('DONE')).length;
    L.ok(`Daily run complete! ${tc} chats | ${ok}/${accounts.length} OK`, 'System');
}

async function main() {
    const accounts = loadAccounts();
    state.accounts = accounts.map((a, i) => ({
        index: i + 1, name: a.name, status: 'WAITING',
        points: -1, credits: -1, chats: 0, tasks: '-',
        lastRun: null, nextRun: null, info: 'Ready',
    }));

    startDash();
    L.info(`Loaded ${accounts.length} account(s)`, 'System');
    L.info(`Session keepalive: every ${SESSION_KEEPALIVE_MS / 60000}m`, 'System');

    // Run immediately on first start
    let firstRun = true;

    while (true) {
        try { await runAll(accounts); } catch (e) { L.err(`Run error: ${e.message}`, 'System'); }

        const nr = getNextRun();
        state.nextGlobalRun = nr;
        L.info(`Next run: ${new Date(nr).toLocaleString()} (${fmtDur(nr - Date.now())})`, 'Schedule');

        state.accounts.forEach(a => {
            if (!a.status?.includes('EXPIRED')) a.status = 'IDLE';
        });

        // Start keepalive during idle
        state.keepaliveActive = true;
        const keepalivePromise = sessionKeepAlive(accounts);

        // Wait until next run
        let rem = nr - Date.now();
        while (rem > 0) {
            await sleep(Math.min(rem, 60000));
            rem = nr - Date.now();
        }

        // Stop keepalive
        state.keepaliveActive = false;
        state.nextGlobalRun = null;
    }
}

main().catch(e => {
    stopDash();
    console.error(chalk.red('\n  ✖ Fatal:'), e.message);
    process.exit(1);
});
