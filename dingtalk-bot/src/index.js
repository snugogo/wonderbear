require('dotenv').config({ path: __dirname + '//../.env' });
const { DWClient, TOPIC_ROBOT, EventAck } = require('dingtalk-stream-sdk-nodejs');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lessonsHelper = require('./lessons-helper');
const statusHelper = require('./status-helper');
const promptTrimmer = require('./prompt-trimmer');
const factoryDispatch = require('./factory-dispatch');
const doneWatcher = require('./done-watcher');
const commandRouter = require('./command-router');

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

console.log('[BOOT] DingTalk bot v0.9.2 (router+watcher) starting...');
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
let STATUS_MD_CONTENT = '';

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
  try {
    STATUS_MD_CONTENT = statusHelper.readStatus();
    console.log(`[KNOWLEDGE] STATUS.md loaded: ${STATUS_MD_CONTENT.length} chars`);
    // 启动时扫一眼 Factory 未消化报告
    const reports = statusHelper.scanFactoryReports(5);
    if (reports.length > 0) {
      console.log(`[FACTORY] ${reports.length} 个未消化报告: ${reports.map(r => r.name).join(', ')}`);
    }
  } catch (err) {
    console.error('[KNOWLEDGE] STATUS.md load failed:', err.message);
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
  // 精简版 sysHint - 只放路径和触发规则,不再注入全文(节省 90% token)
  // 解决: Opus/Sonnet headless 长 prompt 下 stdin 写入超时 SIGTERM exit 143
  // Claude 真需要时自己用 view tool 或 bash cat 读文件
  const lessonsLen = LESSONS_MD_CONTENT.length;
  const statusLen = STATUS_MD_CONTENT.length;
  const claudeLen = CLAUDE_MD_CONTENT.length;
  let sysHint = '你是 WonderBear 项目 VPS 总指挥, 通过钉钉跟 Kristy(PM,不读代码)沟通。\n';
  sysHint += '工作目录: ' + WORKSPACE + '\n\n';
  sysHint += '# 工作风格\n';
  sysHint += '- 简洁, 中文回复 < 2000 字\n';
  sysHint += '- 给 A/B/C 选项 + 推荐 + 一句理由, Kristy 拍板\n';
  sysHint += '- 不要 dump 长 log, 要总结\n';
  sysHint += '- 不确定就读文档, 不要编\n\n';
  sysHint += '# 决策权边界\n';
  sysHint += '- 自主: 改代码、commit 到分支、派 Factory(spawn-droid.sh)、curl 自检、pm2 restart、写 coordination/、烧 < 5 美元\n';
  sysHint += '- 红线: git push origin main、改 .env 密钥、烧 > 5 美元、改 PRODUCT_CONSTITUTION.md / AGENTS.md / CLAUDE.md\n\n';
  sysHint += '# 关键文档(需要时用 cat 或 view tool 读)\n';
  sysHint += '- /opt/wonderbear/dingtalk-bot/CLAUDE.md (' + claudeLen + ' 字符) - 你的角色完整定义\n';
  sysHint += '- /opt/wonderbear/dingtalk-bot/LESSONS.md (' + lessonsLen + ' 字符) - 踩坑教训库\n';
  sysHint += '- /opt/wonderbear/dingtalk-bot/STATUS.md (' + statusLen + ' 字符) - 项目最新状态(强烈建议先读)\n';
  sysHint += '- /opt/wonderbear/AGENTS.md - 协作 AI 行为规则\n';
  sysHint += '- /opt/wonderbear/PRODUCT_CONSTITUTION.md - 产品锁定决策\n\n';
  sysHint += '# 自学习触发(粗粒度判断)\n';
  sysHint += '- 解决了新问题/发现坑/学到命令用法 → 回复末尾追加 [LESSON_CANDIDATE]\n';
  sysHint += '  格式: 标题: xxx / 场景: xxx / 解决: xxx\n';
  sysHint += '- 完成实质性工作(改代码commit/解bug/派Factory/做决策) → 末尾追加 [STATUS_UPDATE]\n';
  sysHint += '  格式: 完成: xxx / 影响: xxx / 下一步: xxx\n';
  sysHint += '- 鸡毛蒜皮、回答问题、查日志、给建议但没执行 → 不要触发\n\n';
  sysHint += '# 当不确定时\n';
  sysHint += '1. 读 LESSONS.md (cat /opt/wonderbear/dingtalk-bot/LESSONS.md)\n';
  sysHint += '2. 读 STATUS.md\n';
  sysHint += '3. 跑只读命令查真值 (ls/cat/grep/pm2 status/curl)\n';
  sysHint += '4. web_search (外部 API/技术细节)\n';
  sysHint += '5. 告诉 Kristy 不确定 + 1-2 个最可能方向\n';
  sysHint += '6. 绝不编造\n';

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
    stdio: ['ignore', 'pipe', 'pipe'],
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

// === v0.9.2 done-watcher: 后台轮询 coordination/done/, 推送新报告 ===
let cachedWebhook = null;
doneWatcher.start((filename, summary, matched) => {
  if (!cachedWebhook) {
    console.log('[DONE-WATCHER] no cachedWebhook yet, skip push for', filename);
    return;
  }
  const head = matched ?
    ('\u2705 Factory \u5b8c\u6210: ' + matched.workorderId + ' (PID=' + matched.pid + ')\n\n') :
    ('\u2705 \u65b0\u62a5\u544a: ' + filename + '\n\n');
  const body = head + summary;
  reply(cachedWebhook, body, ALLOWED_USER_IDS[0]).catch(e => console.error('[DONE-WATCHER] push failed:', e.message));
});

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

    // === v0.9.2: \u7f13\u5b58 webhook \u4f9b done-watcher \u63a8\u9001 ===
    cachedWebhook = sessionWebhook;

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

    // === v0.9.2: \u4e2d\u6587\u547d\u4ee4\u8def\u7531 ===
    const routed = commandRouter.route(effectiveContent);
    if (routed.handled) {
      await reply(sessionWebhook, routed.reply, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    // === v0.9.2: \u5355\u6761\u6d88\u606f\u957f\u5ea6\u62d2\u6536 ===
    const lenCheck = promptTrimmer.checkUserMessage(effectiveContent);
    if (!lenCheck.ok) {
      await reply(sessionWebhook, '\u26a0\ufe0f ' + lenCheck.reason, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/ping') {
      await reply(sessionWebhook, `🏓 pong\n时间: ${new Date().toISOString()}`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/status') {
      const s = loadState();
      await reply(sessionWebhook,
        `🤖 钉钉机器人 v0.9.2 (router+watcher)\n` +
        `今日总次数: ${s.date === todayKey() ? s.count : 0}/${DAILY_LIMIT}\n` +
        `Opus 已用: ${s.date === todayKey() ? (s.opusCount || 0) : 0}/${OPUS_DAILY_LIMIT}\n` +
        `当前模型: ${s.model || 'sonnet'}\n` +
        `记忆: ${(s.memory || []).length}/${MEMORY_TURNS} 轮\n` +
        `冻结状态: ${s.frozen ? '❄️ 已冻结' : '✅ 正常'}\n` +
        `活跃进程: ${activeProcs.size}\n\n` +
        `指令:\n• /ping\n• /status\n• /myid\n• /kill\n• /freeze /unfreeze\n• /model sonnet | opus | haiku\n• /clear - 清除记忆\n• /lessons - 查看教训库\n• /learn 内容 - 手动记录教训\n• /unlearn - 撤销最近一条\n• /status-show - 查看最近进度\n• /sync 内容 - 投递外部进度\n• /status-refresh - 扫描 Factory 报告\n• /archive-status - 归档老进度\n• 其他文字 → 自由对话(${MEMORY_TURNS} 轮 + 全知识库)`,
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

    if (content === '/status-show') {
      const recent = statusHelper.listRecentUpdates();
      if (!recent || recent === '(无最近进度)') {
        await reply(sessionWebhook, '📊 STATUS.md 暂无最近进度记录', senderStaffId);
      } else {
        await reply(sessionWebhook, `📊 最近进度:\n\n${recent.slice(0, 3500)}`, senderStaffId);
      }
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content.startsWith('/sync ')) {
      const text = content.slice(6).trim();
      if (!text) {
        await reply(sessionWebhook, '用法: /sync 我刚才在外面做了什么(我会自动整理成进度条目)', senderStaffId);
        return { status: EventAck.SUCCESS, message: 'OK' };
      }
      const syncPrompt = `Kristy 让你同步一条外部进度。她说:\n\n${text}\n\n请整理成 STATUS.md 标准格式,直接在回复里输出 [STATUS_UPDATE] 块,source 标记为"Kristy 手动同步",不要其他多余内容。`;
      runClaude(syncPrompt, 'sonnet', async (err, output) => {
        if (err) { await reply(sessionWebhook, `❌ 整理失败: ${err.message}`, senderStaffId); return; }
        const { extracted } = statusHelper.extractStatusUpdates(output || '');
        if (extracted.length === 0) {
          await reply(sessionWebhook, '⚠️ Claude 没生成标准格式: ' + (output || '(空)').slice(0, 300), senderStaffId);
          return;
        }
        extracted[0].source = 'Kristy 手动同步';
        const result = statusHelper.appendUpdate(extracted[0]);
        if (result.ok) {
          reloadKnowledge();
          await reply(sessionWebhook, `📊 已同步: ${extracted[0].summary}${extracted[0].impact ? '\n影响: ' + extracted[0].impact : ''}${extracted[0].next ? '\n下一步: ' + extracted[0].next : ''}`, senderStaffId);
        } else {
          await reply(sessionWebhook, `❌ 写入失败: ${result.message}`, senderStaffId);
        }
      });
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/status-refresh') {
      const reports = statusHelper.scanFactoryReports(10);
      if (reports.length === 0) {
        await reply(sessionWebhook, '🔍 coordination/done/ 没有未消化的 Factory 报告', senderStaffId);
        return { status: EventAck.SUCCESS, message: 'OK' };
      }
      const reportList = reports.map(r => `- ${r.name} (${r.mtime.toISOString().slice(0, 16)})`).join('\n');
      await reply(sessionWebhook, `🔍 发现 ${reports.length} 个未消化的 Factory 报告:\n\n${reportList}\n\n我接下来会逐个读取并整理到 STATUS.md (这会烧 ${reports.length} 次 token)`, senderStaffId);

      // 串行处理每个报告
      for (const report of reports) {
        try {
          const reportContent = fs.readFileSync(report.path, 'utf-8').slice(0, 8000);
          const refreshPrompt = `这是 Factory 完成任务后的报告。请提取关键完成事项,直接输出 [STATUS_UPDATE] 块(source 标记为"Factory droid"):\n\n${reportContent}`;
          await new Promise((resolve) => {
            runClaude(refreshPrompt, 'sonnet', async (err, output) => {
              if (err) { console.error('[STATUS_REFRESH]', err.message); resolve(); return; }
              const { extracted } = statusHelper.extractStatusUpdates(output || '');
              for (const update of extracted) {
                update.source = 'Factory droid';
                statusHelper.appendUpdate(update);
              }
              statusHelper.markFactoryReportProcessed(report.path);
              resolve();
            });
          });
        } catch (err) {
          console.error('[STATUS_REFRESH] processing failed for', report.name, err.message);
        }
      }
      reloadKnowledge();
      await reply(sessionWebhook, `✅ 处理完成,STATUS.md 已更新。/status-show 查看`, senderStaffId);
      return { status: EventAck.SUCCESS, message: 'OK' };
    }

    if (content === '/archive-status') {
      const r = statusHelper.archiveOldLogs();
      if (r.ok) {
        reloadKnowledge();
        await reply(sessionWebhook, `✅ ${r.message}`, senderStaffId);
      } else {
        await reply(sessionWebhook, `❌ ${r.message}`, senderStaffId);
      }
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

    // === v0.9.2: \u88c1\u5269\u5386\u53f2 ===
    const trimmedMemory = promptTrimmer.trimMemory(memory);
    const fullPrompt = promptTrimmer.clampPrompt(buildPrompt(effectiveContent, trimmedMemory) + imagePromptHint);

    runClaude(fullPrompt, model, async (err, output) => {
      safeDeleteFile(imagePath);
      if (err) {
        await reply(sessionWebhook, `❌ 出错: ${err.message}`, senderStaffId);
        return;
      }
      let answer = output || '(空回复)';

      // 自动学习: 检测 [LESSON_CANDIDATE] + [STATUS_UPDATE] 块
      let workingReply = answer;
      let summaries = [];

      // [LESSON_CANDIDATE]
      const lessonResult = lessonsHelper.extractLessonCandidates(workingReply);
      if (lessonResult.extracted.length > 0) {
        const recorded = [];
        const skipped = [];
        for (const lesson of lessonResult.extracted) {
          const r = lessonsHelper.appendLesson(lesson);
          if (r.ok) recorded.push(lesson.title);
          else skipped.push(`${lesson.title} (${r.message})`);
        }
        if (recorded.length > 0) summaries.push(`📚 已记录 ${recorded.length} 条教训: ${recorded.join(', ')}`);
        if (skipped.length > 0) summaries.push(`⚠️ 跳过教训 ${skipped.length} 条: ${skipped.join('; ')}`);
        workingReply = lessonResult.cleanedReply;
      }

      // [STATUS_UPDATE]
      const statusResult = statusHelper.extractStatusUpdates(workingReply);
      if (statusResult.extracted.length > 0) {
        const recorded = [];
        const skipped = [];
        for (const update of statusResult.extracted) {
          const r = statusHelper.appendUpdate(update);
          if (r.ok) recorded.push(update.summary);
          else skipped.push(`${update.summary} (${r.message})`);
        }
        if (recorded.length > 0) summaries.push(`📊 已更新 ${recorded.length} 条进度: ${recorded.join('; ')}`);
        if (skipped.length > 0) summaries.push(`⚠️ 跳过进度 ${skipped.length} 条: ${skipped.join('; ')}`);
        workingReply = statusResult.cleanedReply;
      }

      if (summaries.length > 0) {
        reloadKnowledge();
        answer = workingReply + '\n\n' + summaries.join('\n');
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
