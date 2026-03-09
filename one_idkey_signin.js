const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const accountNames = Array.from({ length: 10 }, (_, i) => process.env[`USER_${i + 1}`]).filter(
  (u) => u && u !== 'undefined'
);

const passwordFor = (username) =>
  username === 'zengfei19880126@gmail.com'
    ? (process.env.PASSWORD_SPECIAL || 'Zengfei521.Zengfei521.')
    : (process.env.PASSWORD || 'Zengfei521.');

const CONFIG = {
  url: 'https://one.idkey.cc/',
  accounts: accountNames.map((username) => ({ username, password: passwordFor(username) })),
  botToken: process.env.BOT_TOKEN,
  chatId: process.env.CHAT_ID,
  evidenceDir: path.join(process.cwd(), 'artifacts'),
  stateDir: path.join(process.cwd(), 'state')
};

fs.mkdirSync(CONFIG.evidenceDir, { recursive: true });
fs.mkdirSync(CONFIG.stateDir, { recursive: true });

function now() {
  return new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}

async function notifyTelegram(message) {
  if (!CONFIG.botToken || !CONFIG.chatId) {
    throw new Error('缺少 BOT_TOKEN 或 CHAT_ID');
  }

  await axios.post(
    `https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`,
    {
      chat_id: CONFIG.chatId,
      text: message,
      disable_web_page_preview: true
    },
    { timeout: 30000 }
  );
}

async function safeNotify(message) {
  try {
    await notifyTelegram(message);
  } catch (error) {
    console.error('电报通知失败:', error.message);
    throw error;
  }
}

async function getPoints(page) {
  try {
    await page.waitForTimeout(3000);
    return await page.evaluate(() => {
      const byIdStudent = document.getElementById('displayStudentPoints')?.innerText?.trim();
      const byIdVeteran = document.getElementById('displayVeteranPoints')?.innerText?.trim();

      const byText = (keyword) => {
        const el = Array.from(document.querySelectorAll('div, span, p, strong, small')).find(
          (e) => (e.innerText || '').includes(keyword)
        );
        if (!el) return null;
        const text = el.innerText.replace(/\s+/g, ' ').trim();
        const match = text.match(/(\d+(?:\.\d+)?)/g);
        return match ? match[match.length - 1] : null;
      };

      return {
        s: byIdStudent || byText('学生积分') || '0',
        v: byIdVeteran || byText('老兵积分') || '0'
      };
    });
  } catch {
    return { s: '?', v: '?' };
  }
}

function safeName(input) {
  return String(input || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomDelay(minMs = 2500, maxMs = 9000) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function statePathFor(username) {
  return path.join(CONFIG.stateDir, `${safeName(username)}.json`);
}

async function detectCloudflareChallenge(page) {
  return await page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const html = document.documentElement?.outerHTML || '';
    const frames = Array.from(document.querySelectorAll('iframe')).map((f) => ({
      title: f.getAttribute('title') || '',
      src: f.getAttribute('src') || ''
    }));
    const hasChallenge = /cloudflare|安全质询|验证您是真人|verify you are human|turnstile/i.test(text + ' ' + html + ' ' + JSON.stringify(frames));
    return { hasChallenge, text: text.slice(0, 2000), frames };
  }).catch(() => ({ hasChallenge: false, text: '', frames: [] }));
}

async function saveEvidence(page, username, stage, extra = {}) {
  const base = `${new Date().toISOString().replace(/[.:]/g, '-')}_${safeName(username)}_${safeName(stage)}`;
  const pngPath = path.join(CONFIG.evidenceDir, `${base}.png`);
  const htmlPath = path.join(CONFIG.evidenceDir, `${base}.html`);
  const jsonPath = path.join(CONFIG.evidenceDir, `${base}.json`);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const html = await page.content().catch(() => '');
  const title = await page.title().catch(() => '');
  const url = page.url();
  const challenge = await detectCloudflareChallenge(page);
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button,a,input[type="submit"]')).map(el => ({ text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim(), tag: el.tagName, href: el.getAttribute('href') || '' })).filter(x => x.text).slice(0, 80)).catch(() => []);
  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});
  fs.writeFileSync(htmlPath, html || '', 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify({ title, url, bodyText: String(bodyText).slice(0, 4000), challenge, buttons, extra }, null, 2), 'utf8');
  return { pngPath, htmlPath, jsonPath, challenge };
}

async function openLogin(page) {
  await page.evaluate(() => {
    document.querySelectorAll('#maintenanceOverlay, .modal-backdrop').forEach((el) => el.remove());
    document.body.classList.remove('modal-open', 'scroll-locked');
    document.body.style.overflow = 'auto';

    if (typeof openModal === 'function') {
      try { openModal('login'); } catch {}
    }

    const candidates = Array.from(document.querySelectorAll('button, a, div'));
    const loginEl = candidates.find((el) => /登录|登入/.test((el.innerText || '').trim()));
    if (loginEl) loginEl.click();
  });

  const userSelectors = ['#loginUser', 'input[placeholder*="用户"]', 'input[placeholder*="邮箱"]', 'input[type="text"]'];
  for (const sel of userSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.waitFor({ state: 'visible', timeout: 8000 });
        return;
      } catch {}
    }
  }

  throw new Error('登录弹窗未成功打开');
}

async function hasLoggedInView(page) {
  return await page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return /退出|登出|购买积分|兑换积分|端口实时通过状态|成功|失败/.test(text) || !!document.getElementById('displayStudentPoints') || !!document.getElementById('displayVeteranPoints');
  }).catch(() => false);
}

async function login(page, acc) {
  await openLogin(page);
  await saveEvidence(page, acc.username, 'login-modal-open');

  const userField = page.locator('#loginUser, input[placeholder*="用户"], input[placeholder*="邮箱"], input[type="text"]').first();
  const passField = page.locator('#loginPass, input[type="password"]').first();

  await userField.fill(acc.username);
  await passField.fill(acc.password);
  await saveEvidence(page, acc.username, 'login-filled');

  const submit = page.locator('#authModal .btn-action, button:has-text("登录系统"), button:has-text("登录"), .btn-action').first();
  if (await submit.count()) {
    await submit.click({ force: true }).catch(() => {});
  }

  await page.evaluate(() => {
    if (typeof performLogin === 'function') {
      try { performLogin(); } catch {}
    }
  });

  await page.waitForTimeout(12000);
  const evidence = await saveEvidence(page, acc.username, 'after-login-submit');
  if (evidence.challenge?.hasChallenge) {
    throw new Error('检测到 Cloudflare 安全质询，GitHub Actions 无头环境被拦截');
  }
}

async function clickSignin(page) {
  const selectors = [
    '#displayVeteranPoints + button',
    '#displayVeteranPoints ~ button',
    'button:has(i.fa-calendar-check)',
    'a:has(i.fa-calendar-check)',
    'button:has-text("签到")',
    'a:has-text("签到")',
    '.btn-signin'
  ];

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        if (await loc.isVisible()) {
          await loc.click({ force: true, delay: 200 });
          return true;
        }
      } catch {}
    }
  }

  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, div'));
    const el = candidates.find((node) => {
      const text = (node.innerText || '').trim();
      const html = node.innerHTML || '';
      return /签到/.test(text) || /fa-calendar-check/.test(html);
    });
    if (el) {
      el.click();
      return true;
    }
    return false;
  });

  return clicked;
}

function buildSummary(results, startedAt) {
  const success = results.filter((r) => r.ok && r.changed);
  const noChange = results.filter((r) => r.ok && !r.changed);
  const fail = results.filter((r) => !r.ok);
  const cfBlocked = results.filter((r) => r.cfBlocked);

  const lines = [
    '[GitHub 签到汇总]',
    `时间: ${startedAt}`,
    `账户数: ${results.length}/10`,
    `签到成功: ${success.length}`,
    `未见积分变化: ${noChange.length}`,
    `CF 拦截: ${cfBlocked.length}`,
    `失败: ${fail.length}`,
    ''
  ];

  if (success.length) {
    lines.push('✅ 签到成功账号');
    for (const item of success) {
      lines.push(`- ${item.username} | 🎓 ${item.before.s} -> ${item.after.s} | 🎖 ${item.before.v} -> ${item.after.v} | 签到成功，积分已变化`);
    }
    lines.push('');
  }

  if (noChange.length) {
    lines.push('🟦 未见积分变化账号');
    for (const item of noChange) {
      lines.push(`- ${item.username} | 🎓 ${item.before.s} -> ${item.after.s} | 🎖 ${item.before.v} -> ${item.after.v} | ${item.note}`);
    }
    lines.push('');
  }

  if (cfBlocked.length) {
    lines.push('🟨 CF 拦截账号');
    for (const item of cfBlocked) {
      lines.push(`- ${item.username} | 检测到 Cloudflare 安全质询，已保存取证并停止；请人工过验证后重新运行任务`);
    }
    lines.push('');
  }

  if (fail.length) {
    lines.push('❌ 失败账号');
    for (const item of fail) {
      lines.push(`- ${item.username} | ${item.error}`);
    }
    lines.push('');
  }

  if (cfBlocked.length || fail.length) {
    lines.push('已保存取证产物到 workflow artifacts，可据此继续修复。');
    lines.push('');
  }

  return lines.join('\n').trim();
}

(async () => {
  const startedAt = now();

  if (CONFIG.accounts.length !== 10) {
    const msg = `[GitHub 签到预警]\n时间: ${startedAt}\n当前只配置了 ${CONFIG.accounts.length}/10 个账号\n缺少 Secrets: ${Array.from({ length: 10 }, (_, i) => `USER_${i + 1}`).filter((k) => !process.env[k]).join(', ')}\n\n本次先按现有账号继续执行，便于从 Telegram 汇总里确认已配置的账号列表。`;
    await safeNotify(msg);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const accounts = shuffle(CONFIG.accounts);

  try {
    for (const acc of accounts) {
      const storageStatePath = statePathFor(acc.username);
      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai'
      };
      if (fs.existsSync(storageStatePath)) {
        contextOptions.storageState = storageStatePath;
      }
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      try {
        console.log(`正在为账号 ${acc.username} 执行签到...`);
        await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 90000 });

        let reusedState = false;
        if (fs.existsSync(storageStatePath)) {
          await page.waitForTimeout(randomDelay(1500, 4000));
          reusedState = await hasLoggedInView(page);
        }

        if (!reusedState) {
          await login(page, acc);
          await context.storageState({ path: storageStatePath }).catch(() => {});
          await page.waitForTimeout(randomDelay(2500, 6000));
        }

        const before = await getPoints(page);
        const clicked = await clickSignin(page);

        await page.waitForTimeout(clicked ? 12000 : 5000);
        if (clicked) {
          await page.evaluate(() => {
            const ok = Array.from(document.querySelectorAll('button, a')).find((el) => /确定|OK|知道了|提交/.test(el.innerText || ''));
            if (ok) ok.click();
          }).catch(() => {});
          await page.waitForTimeout(3000);
          await page.reload({ waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
          await page.waitForTimeout(5000);
        }

        const after = await getPoints(page);
        const changed = before.s !== after.s || before.v !== after.v;
        const note = clicked ? (changed ? '签到成功，积分已变化' : '已点击签到但积分未变化') : '未见签到按钮，可能今日已签到';

        await context.storageState({ path: storageStatePath }).catch(() => {});
        results.push({ ok: true, changed, username: acc.username, before, after, note, reusedState });
      } catch (error) {
        console.error(`${acc.username} 失败:`, error.message);
        const isCfBlocked = /Cloudflare 安全质询|CF|challenge/i.test(error.message || '');
        results.push({ ok: false, changed: false, username: acc.username, error: error.message, cfBlocked: isCfBlocked });
        if (isCfBlocked) {
          const alert = `[GitHub 签到告警]\n时间: ${now()}\n账号: ${acc.username}\n状态: 检测到 Cloudflare 安全质询\n处理: 已保存取证并停止本次任务\n\n下一步请这样做：\n1. 打开签到网站并人工完成验证/登录： https://one.idkey.cc/\n2. 验证完成后，重新运行 GitHub Actions 里的签到工作流\n3. 如需排查细节，请到本次 run 的 artifacts 查看截图/HTML/JSON 取证文件\n\n注意：当前这次已停止，不能原地继续，只能在你人工过验证后重新运行。`;
          await safeNotify(alert);
          break;
        }
      } finally {
        await page.waitForTimeout(randomDelay(3000, 8000)).catch(() => {});
        await page.close();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summary = buildSummary(results, startedAt);
  await safeNotify(summary);

  const failedCount = results.filter((r) => !r.ok).length;
  const cfBlockedCount = results.filter((r) => r.cfBlocked).length;
  if (cfBlockedCount > 0) {
    throw new Error(`签到被 Cloudflare 拦截: ${cfBlockedCount}`);
  }
  if (failedCount > 0) {
    throw new Error(`签到存在失败账号: ${failedCount}`);
  }
})();
