const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const MEMORY_TTL_MS = Math.max(1, Number(process.env.MEMORY_TTL_MINUTES || 30)) * 60_000;
const MEMORY_MAX_MESSAGES = Math.max(2, Number(process.env.MEMORY_MAX_MESSAGES || 12));
const conversations = new Map();

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function verifySignature(rawBody, signature) {
  if (!CHANNEL_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', CHANNEL_SECRET).update(rawBody).digest('base64');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function getConversation(userId) {
  const now = Date.now();
  const existing = conversations.get(userId);
  if (existing && now - existing.updatedAt <= MEMORY_TTL_MS) return existing;
  const fresh = { messages: [], updatedAt: now };
  conversations.set(userId, fresh);
  return fresh;
}

function createReply(text, conversation) {
  const trimmed = text.trim();
  const previousUserMessages = conversation.messages.filter((message) => message.role === 'user');

  if (/^(重置|清除|忘記|忘掉)(記憶|對話|聊天)?[！!。.]?$/.test(trimmed)) {
    conversation.messages = [];
    return '好的，我已清除這段短期對話記憶。';
  }
  if (/^(嗨|哈囉|你好|hello|hi)[！!。.]?$/i.test(trimmed)) {
    return previousUserMessages.length
      ? '嗨，歡迎回來！我還記得我們剛才聊過的內容。今天想接著聊什麼？'
      : '嗨！我是你的 LINE 聊天機器人，可以在這台電腦上陪你聊天。你可以告訴我今天想聊什麼。';
  }
  if (previousUserMessages.length > 0) {
    const earlier = previousUserMessages.at(-1).text;
    return `收到！我記得你剛才提到「${earlier.slice(0, 80)}」。關於「${trimmed.slice(0, 120)}」，可以再多告訴我一些嗎？`;
  }
  return `收到：「${trimmed.slice(0, 160)}」。我會記住這段對話一小段時間；你也可以直接問我問題或告訴我想聊什麼。`;
}

async function replyToLine(replyToken, text) {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`LINE reply failed (${response.status}): ${detail}`);
  }
}

async function handleWebhook(rawBody) {
  const payload = JSON.parse(rawBody.toString('utf8'));
  for (const event of payload.events || []) {
    if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) continue;
    const userId = event.source?.userId || `unknown-${event.replyToken}`;
    const conversation = getConversation(userId);
    const userText = event.message.text;
    const answer = createReply(userText, conversation);
    if (!/^(重置|清除|忘記|忘掉)(記憶|對話|聊天)?[！!。.]?$/.test(userText.trim())) {
      conversation.messages.push({ role: 'user', text: userText }, { role: 'assistant', text: answer });
      conversation.messages = conversation.messages.slice(-MEMORY_MAX_MESSAGES);
    }
    conversation.updatedAt = Date.now();
    await replyToLine(event.replyToken, answer);
  }
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('LINE bot is running. Webhook endpoint: POST /callback\n');
    return;
  }
  if (request.method !== 'POST' || request.url !== '/callback') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 1_000_000) request.destroy();
    else chunks.push(chunk);
  });
  request.on('end', async () => {
    const rawBody = Buffer.concat(chunks);
    if (!verifySignature(rawBody, request.headers['x-line-signature'])) {
      response.writeHead(401);
      response.end('Invalid signature');
      return;
    }
    response.writeHead(200);
    response.end('OK');
    try {
      await handleWebhook(rawBody);
    } catch (error) {
      console.error('Webhook processing failed:', error);
    }
  });
});

if (!CHANNEL_SECRET || !ACCESS_TOKEN) {
  console.error('Set LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN in .env before starting.');
  process.exitCode = 1;
} else {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`LINE bot listening on http://localhost:${PORT}`);
    console.log(`Webhook path: /callback (memory expires after ${MEMORY_TTL_MS / 60_000} minutes)`);
  });
}
