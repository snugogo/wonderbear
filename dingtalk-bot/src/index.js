require('dotenv').config({ path: __dirname + '//../.env' });
const { DWClient, TOPIC_ROBOT, EventAck } = require('dingtalk-stream-sdk-nodejs');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lessonsHelper = require('./lessons-helper');

const CLIENT_ID = process.env.DINGTALK_CLIENT_ID;
const CLIENT_SECRET = process.env.DINGTALK_CLIENT_SECRET;
const ALLOWED_USER_IDS = (process.env.ALLOWED_USER_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const WORKSPACE = process.env.WORKSPACE_PATH || '/opt/wonderbear';
const CLAUDE_CLI = process.env.CLAUDE_CLI || 'claude';
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '100', 10);
const OPUS_DAILY_LIMIT = parseInt(process.env.OPUS_DAILY_LIMIT || '20', 10);
const MEMORY_TURNS = parseInt(process.env.MEMORY_TURNS || '5', 10);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[FATAL] DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET missing');
  process.exit(1);
}

console.log('[BOOT] DingTalk bot v0.8 (self-learning) starting...');
console.log('[BOOT] Client ID prefix:', CLIENT_ID.substring(0, 10) + '...');
console.log('[BOOT] Allowed users:', ALLOWED_USER_IDS.join(',') || '(none)');
console.log('[BOOT] Workspace:', WORKSPACE);
console.log('[BOOT] Daily limit:', DAILY_LIMIT, '(Opus:', OPUS_DAILY_LIMIT + ')');
console.log('[BOOT] Memory turns:', MEMORY_TURNS);

const STATE_FILE = '/tmp/dingtalk-bot-state.json';
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { date: '', count: 0, frozen: false, model: 'sonnet', memory: [] }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function checkAndIncrement(model) {
  const s = loadState();
  const today = todayKey();
  if (s.date !== today) { s.date = today; s.count = 0; s.opusCount = 0; }
  if (typeof s.opusCount !== 'number') s.opusCount = 0;
  if (s.frozen) return { ok: false, reason: 'frozen' };
  if (s.count >= DAILY_LIMIT) return { ok: false, reason: 'daily_limit', used: s.count, limit: DAILY_LIMIT };
  if (model === 'opus' && s.opusCount >= OPUS_DAILY_LIMIT) {
    return { ok: false, reason: 'opus_limit', used: s.opusCount, limit: OPUS_DAILY_LIMIT };
  }
  s.count += 1;
  if (model === 'opus') s.opusCount += 1;
  saveState(s);
  return { ok: true, used: s.count, limit: DAILY_LIMIT, opusUsed: s.opusCount, opusLimit: OPUS_DAILY_LIMIT };
}


// 幂等性: 双层 dedup
//   L1: msgId (防止 SDK 重投)
//   L2: senderStaffId+content (防止钉钉服务端重发, 90秒窗口)
const processedMsgIds = new Map();
const processedContentKeys = new Map();
function isAlreadyProcessed(msgId, senderStaffId, content) {
  const now = Date.now();
  // 清理过期记录
  for (const [k, t] of processedMsgIds) {
    if (now - t > 60000) processedMsgIds.delete(k);
  }
  for (const [k, t] of processedContentKeys) {
    if (now - t > 90000) processedContentKeys.delete(k);
  }
  // L1: msgId 检查
  if (msgId && processedMsgIds.has(msgId)) return 'msgId';
  // L2: 内容+用户 检查
  const contentKey = `${senderStaffId}:${content}`;
  if (processedContentKeys.has(contentKey)) return 'content';
  // 记录
  if (msgId) processedMsgIds.set(msgId, now);
  processedContentKeys.set(contentKey, now);
  return null;
}

const activeProcs = new Set();
function killAllActive() {
  let n = 0;
  for (const p of activeProcs) { try { p.kill('SIGTERM'); n++; } catch {} }
  activeProcs.clear();
  return n;
}



// ===== 启动时加载 CLAUDE.md + LESSONS.md =====
const CLAUDE_MD_PATH = path.join(__dirname, '..', 'CLAUDE.md');
let CLAUDE_MD_CONTENT = '';
let LESSONS_MD_CONTENT = '';

function reloadKnowledge() {
  try {
    if (fs.existsSync(CLAUDE_MD_PATH)) {
      CLAUDE_MD_CONTENT = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
      console.log(`[KNOWLEDGE] CLAUDE.md loaded: ${CLAUDE_MD_CONTENT.length} chars`);
    } else {
      console.warn('[KNOWLEDGE] CLAUDE.md not found');
    }
  } catch (err) {
    console.error('[KNOWLEDGE] CLAUDE.md load failed:', err.message);
  }
  try {
    LESSONS_MD_CONTENT = lessonsHelper.readLessons();
    console.log(`[KNOWLEDGE] LESSONS.md loaded: ${LESSONS_MD_CONTENT.length} chars`);
  } catch (err) {
    console.error('[KNOWLEDGE] LESSONS.md load failed:', err.message);
  }
}

reloadKnowledge();

// ===== 图片下载相关 =====
const IMAGE_DIR = '/tmp/dingtalk-images';
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

async function downloadImage(downloadCode, robotCode) {
  // Step 1: 拿 access token
  let accessToken;
  try {
    const tokenRes = await axios.post('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      appKey: CLIENT_ID,
      appSecret: CLIENT_SECRET,
    });
    accessToken = tokenRes.data?.accessToken;
    if (!accessToken) throw new Error('No accessToken in response');
  } catch (err) {
    throw new Error('AccessToken fetch failed: ' + err.message);
  }

  // Step 2: 用 downloadCode 换真实 URL
  let downloadUrl;
  try {
    const urlRes = await axios.post(
      'https://api.dingtalk.com/v1.0/robot/messageFiles/download',
      { downloadCode, robotCode },
      { headers: { 'x-acs-dingtalk-access-token': accessToken } }
    );
    downloadUrl = urlRes.data?.downloadUrl;
    if (!downloadUrl) throw new Error('No downloadUrl in response');
  } catch (err) {
    throw new Error('downloadUrl fetch failed: ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message));
  }

  // Step 3: 下载图片到本地
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const filePath = path.join(IMAGE_DIR, fileName);
  try {
    const imgRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 30000 });
    fs.writeFileSync(filePath, Buffer.from(imgRes.data));
    return filePath;
  } catch (err) {
    throw new Error('Image binary download failed: ' + err.message);
  }
}

function safeDeleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('[CLEANUP_ERROR]', err.message);
  }
}

const client = new DWClient({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });

async function reply(sessionWebhook, content, atUserId) {
  const safe = content.length > 4500 ? content.slice(0, 4500) + '\n...(已截断)' : content;
  try {
    const r = await axios.post(sessionWebhook, {
      at: atUserId ? { atUserIds: [atUserId], isAtAll: false } : undefined,
      text: { content: safe },
      msgtype: 'text',
    });
    console.log(`[REPLY_OK] preview="${safe.slice(0, 50)}..." status=${r.status}`);
  } catch (err) {
    console.error('[REPLY_ERROR]', err.message, 'webhook=', sessionWebhook?.slice(0, 80));
    if (err.response) console.error('[REPLY_ERROR_BODY]', JSON.stringify(err.response.data).slice(0, 300));
  }
}

// Build prompt with memory history
function buildPrompt(currentMsg, memory) {
  let sysHint = '';
  if (CLAUDE_MD_CONTENT) {
    sysHint += '# 你的角色定义\n\n' + CLAUDE_MD_CONTENT + '\n\n';
  }
  if (LESSONS_MD_CONTENT) {
    sysHint += '# 知识库 (LESSONS.md - 历史踩坑与解法)\n\n' + LESSONS_MD_CONTENT + '\n\n';
  }
  if (!sysHint) {
    sysHint = `You are operating on a VPS (154.217.234.241) for the WonderBear project.
Working directory: ${WORKSPACE}
The user is sending you messages via DingTalk for quick orchestration tasks.
Be concise (DingTalk reply <2000 chars). If you run commands, summarize results, don't dump raw logs.
The user is Kristy, a non-coder PM. Don't show diffs or git status raw output.`;
  }

  let history = '';
  if (memory && memory.length > 0) {
    history = '\n\n=== Previous conversation (oldest first) ===\n';
    memory.forEach((turn, i) => {
      history += `\n[Turn ${i + 1}]\nUser: ${turn.user}\nYou: ${turn.assistant}\n`;
    });
    history += '\n=== End of history ===\n';
  }

  return `${sysHint}${history}\n\n---\nCurrent message from user: ${currentMsg}`;
}

function runClaude(prompt, model, onDone) {
  const args = ['-p', '--dangerously-skip-permissions', '--model', model, prompt];
  const proc = spawn(CLAUDE_CLI, args, {
    cwd: WORKSPACE,
    env: { ...process.env, IS_SANDBOX: '1' },
    timeout: 5 * 60 * 1000,
  });

  activeProcs.add(proc);
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => { stdout += d.toString(); });
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  proc.on('close', (code) => {
    activeProcs.delete(proc);
    if (code === 0) onDone(null, stdout.trim());
    else onDone(new Error(`claude exit ${code}: ${stderr.slice(0, 500)}`), stdout.trim());
  });
  proc.on('error', (err) => { activeProcs.delete(proc); onDone(err, null); });
}

client.registerCallbackListener(TOPIC_ROBOT, async (res) => {
  try {
    const msgId = res?.headers?.messageId;
    const msg = JSON.parse(res.data);
    const { senderStaffId, senderNick, sessionWebhook, text } = msg;
    const content = (text?.content || '').trim();

    // 图片/富文本消息不走内容级 dedup (因为这类消息 content 总是空)
    const isMediaMsg = msg.msgtype === 'picture' || msg.msgtype === 'richText' || msg.msgtype === 'audio' || msg.msgtype === 'file';
    const dedupContent = isMediaMsg ? `__media_${msgId}` : content;
    const dupReason = isAlreadyProcessed(msgId, senderStaffId, dedupContent);
    if (dupReason) {
      console.log(`[DEDUP-${dupReason}] Ignoring msgId=${msgId} from=${senderStaffId} text="${content}" msgtype=${msg.msgtype}`);
      return { status: EventAck.SUCCESS, message: 'OK (dedup)' };
    }

    console.log(`[MSG] msgId=${msgId} from=${senderStaffId} (${senderNick}) text="${content}"`);
    console.log(`[RAW] msgtype=${msg.msgtype}, hasContent=${!!msg.content}, contentKeys=${msg.content ? Object.keys(msg.content).join(",") : "none"}, hasRichText=${!!msg.richText}`);

    if (content === '/myid') {
      await reply(sessionWebhook, `你的 senderStaffId 是:\n${senderStaffId}`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (!ALLOWED_USER_IDS.includes(senderStaffId)) {
      await reply(sessionWebhook, '❌ 无权限', senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    // ===== 图片消息处理 (支持 picture 和 richText 两种 msgtype) =====
    const msgtype = msg.msgtype;
    let imagePath = null;
    let imagePromptHint = '';
    let extractedText = '';

    let downloadCode = null;
    if (msgtype === 'picture') {
      downloadCode = msg.content?.downloadCode;
    } else if (msgtype === 'richText') {
      const items = msg.content?.richText || [];
      for (const item of items) {
        if (item.type === 'picture' && item.downloadCode) {
          downloadCode = item.downloadCode;
        } else if (item.text) {
          extractedText += item.text + ' ';
        }
      }
      extractedText = extractedText.trim();
      if (extractedText) console.log(`[RICHTEXT] Extracted: "${extractedText}"`);
    }

    const robotCode = msg.robotCode;
    if (downloadCode && robotCode) {
      try {
        await reply(sessionWebhook, '📥 正在下载图片...', senderStaffId);
        imagePath = await downloadImage(downloadCode, robotCode);
        imagePromptHint = `\n\n[用户发了一张图片,本地路径: ${imagePath},请用 view 工具读取这张图片然后回答]`;
        console.log(`[IMAGE] Downloaded to ${imagePath}`);
      } catch (err) {
        console.error('[IMAGE_ERROR]', err.message);
        await reply(sessionWebhook, `❌ 图片下载失败: ${err.message}`, senderStaffId);
        return { status: EventAck.SUCCESS, message: 'OK' };
      }
    }

    let effectiveContent = content;
    if (msgtype === 'richText' && extractedText) {
      effectiveContent = extractedText;
    }

    // 只发图没文字: 拒绝处理 + 提示用户 (不烧 token)
    if (imagePath && !effectiveContent) {
      console.log('[IMAGE] 只有图没文字, 提示用户');
      safeDeleteFile(imagePath);
      await reply(sessionWebhook,
        '📷 收到图片了,但需要你告诉我看图做什么\n\n例如:\n• "这是什么错误?"\n• "帮我翻译图里的文字"\n• "这是什么产品?"\n\n请图片+文字一起发。',
        senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/ping') {
      await reply(sessionWebhook, `🏓 pong\n时间: ${new Date().toISOString()}`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/status') {
      const s = loadState();
      await reply(sessionWebhook,
        `🤖 钉钉机器人 v0.8 (self-learning)\n` +
        `今日总次数: ${s.date === todayKey() ? s.count : 0}/${DAILY_LIMIT}\n` +
        `Opus 已用: ${s.date === todayKey() ? (s.opusCount || 0) : 0}/${OPUS_DAILY_LIMIT}\n` +
        `当前模型: ${s.model || 'sonnet'}\n` +
        `记忆: ${(s.memory || []).length}/${MEMORY_TURNS} 轮\n` +
        `冻结状态: ${s.frozen ? '❄️ 已冻结' : '✅ 正常'}\n` +
        `活跃进程: ${activeProcs.size}\n\n` +
        `指令:\n• /ping\n• /status\n• /myid\n• /kill\n• /freeze /unfreeze\n• /model sonnet | opus | haiku\n• /clear - 清除记忆\n• /lessons - 查看教训库\n• /learn 内容 - 手动记录教训\n• /unlearn - 撤销最近一条\n• 其他文字 → 自由对话(${MEMORY_TURNS} 轮 + LESSONS.md)`,
        senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/kill') {
      const n = killAllActive();
      await reply(sessionWebhook, `🛑 已杀 ${n} 个进程`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/freeze') {
      const s = loadState(); s.frozen = true; saveState(s);
      await reply(sessionWebhook, `❄️ 自由对话已冻结。`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/unfreeze') {
      const s = loadState(); s.frozen = false; saveState(s);
      await reply(sessionWebhook, `✅ 自由对话已恢复`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/clear') {
      const s = loadState(); s.memory = []; saveState(s);
      await reply(sessionWebhook, `🧹 已清除对话记忆`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/lessons' || content === '/lesson') {
      const list = lessonsHelper.listLessons(10);
      if (list.length === 0) {
        await reply(sessionWebhook, '📚 还没有任何教训记录', senderStaffId);
      } else {
        const text = list.map((l, i) => `${i + 1}. ${l.titleLine}`).join('\n');
        await reply(sessionWebhook, `📚 最近 ${list.length} 条教训:\n\n${text}`, senderStaffId);
      }
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/unlearn') {
      const result = lessonsHelper.removeLastLesson();
      if (result.ok) { reloadKnowledge(); await reply(sessionWebhook, `✅ ${result.message}`, senderStaffId); }
      else { await reply(sessionWebhook, `❌ ${result.message}`, senderStaffId); }
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content.startsWith('/learn ')) {
      const text = content.slice(7).trim();
      if (!text) {
        await reply(sessionWebhook, '用法: /learn 教训内容', senderStaffId);
        return { status: EventAck.SUCCESS, message: 'OK' };
      }
      const learnPrompt = `Kristy 让你记录一条教训。她说的是:\n\n${text}\n\n请把它整理成 LESSONS.md 的标准格式,直接在回复里输出 [LESSON_CANDIDATE] 块,不要其他多余内容。`;
      runClaude(learnPrompt, 'sonnet', async (err, output) => {
        if (err) { await reply(sessionWebhook, `❌ 整理失败: ${err.message}`, senderStaffId); return; }
        const { extracted } = lessonsHelper.extractLessonCandidates(output || '');
        if (extracted.length === 0) {
          await reply(sessionWebhook, '⚠️ Claude 没生成标准格式: ' + (output || '(空)').slice(0, 300), senderStaffId);
          return;
        }
        extracted[0].source = '手动';
        const result = lessonsHelper.appendLesson(extracted[0]);
        if (result.ok) {
          reloadKnowledge();
          await reply(sessionWebhook, `📚 已记录: ${extracted[0].title}\n\n场景: ${extracted[0].scenario}\n解决: ${extracted[0].solution}`, senderStaffId);
        } else {
          await reply(sessionWebhook, `❌ 写入失败: ${result.message}`, senderStaffId);
        }
      });
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content.startsWith('/model')) {
      const parts = content.split(/\s+/);
      const target = (parts[1] || '').toLowerCase();
      const valid = ['sonnet', 'opus', 'haiku'];
      if (!valid.includes(target)) {
        await reply(sessionWebhook, `用法: /model sonnet | opus | haiku\n当前: ${loadState().model || 'sonnet'}`, senderStaffId);
        return { status: EventAck.SUCCESS, message: 'OK' };
      }
      const s = loadState();
      s.model = target;
      s.memory = [];
      saveState(s);
      await reply(sessionWebhook, `🔄 模型已切换为 ${target}\n(记忆已清除)`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    // 先读模型再 check (因为 opus 有单独配额)
    const state = loadState();
    const model = state.model || 'sonnet';
    const memory = state.memory || [];

    const gate = checkAndIncrement(model);
    if (!gate.ok) {
      if (gate.reason === 'frozen') {
        await reply(sessionWebhook, '❄️ 自由对话已冻结。', senderStaffId);
      } else if (gate.reason === 'daily_limit') {
        await reply(sessionWebhook, `⚠️ 今日总次数已用完 ${gate.used}/${gate.limit}。明天 UTC 0:00 重置。`, senderStaffId);
      } else if (gate.reason === 'opus_limit') {
        await reply(sessionWebhook, `⚠️ Opus 今日已用 ${gate.used}/${gate.limit} 次,达上限。\n建议: 发 /model sonnet 切换到 Sonnet 继续(总次数还有余额)。`, senderStaffId);
      }
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    const opusInfo = model === 'opus' ? ` | Opus ${gate.opusUsed}/${gate.opusLimit}` : '';
    await reply(sessionWebhook, `🤖 处理中... (今日 ${gate.used}/${gate.limit} | 模型 ${model}${opusInfo} | 记忆 ${memory.length}/${MEMORY_TURNS})`, senderStaffId);

    const fullPrompt = buildPrompt(effectiveContent, memory) + imagePromptHint;

    runClaude(fullPrompt, model, async (err, output) => {
      safeDeleteFile(imagePath);
      if (err) {
        await reply(sessionWebhook, `❌ 出错: ${err.message}`, senderStaffId);
        return;
      }
      let answer = output || '(空回复)';

      // 自动学习: 检测 [LESSON_CANDIDATE] 块
      const { extracted, cleanedReply } = lessonsHelper.extractLessonCandidates(answer);
      if (extracted.length > 0) {
        const recorded = [];
        const skipped = [];
        for (const lesson of extracted) {
          const result = lessonsHelper.appendLesson(lesson);
          if (result.ok) recorded.push(lesson.title);
          else skipped.push(`${lesson.title} (${result.message})`);
        }
        let learnSummary = '';
        if (recorded.length > 0) {
          learnSummary += `\n\n📚 已自动记录 ${recorded.length} 条教训: ${recorded.join(', ')}`;
          reloadKnowledge();
        }
        if (skipped.length > 0) {
          learnSummary += `\n⚠️ 跳过 ${skipped.length} 条: ${skipped.join('; ')}`;
        }
        answer = cleanedReply + learnSummary;
      }

      await reply(sessionWebhook, answer, senderStaffId);
      const s2 = loadState();
      s2.memory = s2.memory || [];
      const userMsg = imagePath ? effectiveContent + ' [带图片]' : effectiveContent;
      s2.memory.push({ user: userMsg, assistant: answer });
      if (s2.memory.length > MEMORY_TURNS) {
        s2.memory = s2.memory.slice(-MEMORY_TURNS);
      }
      saveState(s2);
    });

    return { status: EventAck.SUCCESS, message: 'OK' };

  } catch (err) {
    console.error('[HANDLER_ERROR]', err);
    return { status: EventAck.SUCCESS, message: 'OK (handler error)' };
  }
});

client.connect();
console.log('[READY] DingTalk Stream connected');

process.on('SIGTERM', () => {
  killAllActive();
  console.log('[SHUTDOWN] SIGTERM');
  process.exit(0);
});
