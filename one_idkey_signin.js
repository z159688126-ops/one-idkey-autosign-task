const { chromium } = require('playwright');
const axios = require('axios');

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
  chatId: process.env.CHAT_ID
};

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

  const userSelectors = ['#loginUser', 'input[placeholder*="用户名"]', 'input[placeholder*="邮箱"]', 'input[type="text"]'];
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

async function login(page, acc) {
  await openLogin(page);

  const userField = page.locator('#loginUser, input[placeholder*="用户名"], input[placeholder*="邮箱"], input[type="text"]').first();
  const passField = page.locator('#loginPass, input[type="password"]').first();

  await userField.fill(acc.username);
  await passField.fill(acc.password);

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
  const success = results.filter((r) => r.status === 'success');
  const retrySuccess = results.filter((r) => r.status === 'retry-success');
  const uncertain = results.filter((r) => r.status === 'uncertain');
  const fail = results.filter((r) => r.status === 'failed');
  const lines = [
    '[GitHub 签到汇总]',
    `时间: ${startedAt}`,
    `账户数: ${results.length}/10`,
    `成功: ${success.length}`,
    `补签成功: ${retrySuccess.length}`,
    `异常: ${uncertain.length}`,
    `失败: ${fail.length}`,
    ''
  ];

  const pushGroup = (title, items, formatter) => {
    if (!items.length) return;
    lines.push(title);
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${formatter(item)}`);
      lines.push('');
    });
  };

  pushGroup('✅ 成功账号', success, (item) => `${item.username} | 🎓 ${item.before.s} -> ${item.after.s} | 🎖️ ${item.before.v} -> ${item.after.v} | ${item.note}`);
  pushGroup('🔁 重试后成功', retrySuccess, (item) => `${item.username} | 🎓 ${item.before.s} -> ${item.after.s} | 🎖️ ${item.before.v} -> ${item.after.v} | ${item.note}`);
  pushGroup('⚠️ 异常账号', uncertain, (item) => `${item.username} | 🎓 ${item.before.s} -> ${item.after.s} | 🎖️ ${item.before.v} -> ${item.after.v} | ${item.note}`);
  pushGroup('❌ 失败账号', fail, (item) => `${item.username} | ${item.error}`);

  return lines.join('\n').trim();
}

(async () => {
  const startedAt = now();

  if (CONFIG.accounts.length !== 10) {
    const msg = `[GitHub 签到预警]\n时间: ${startedAt}\n当前只配置了 ${CONFIG.accounts.length}/10 个账号\n缺少的 Secrets: ${Array.from({ length: 10 }, (_, i) => `USER_${i + 1}`).filter((k) => !process.env[k]).join(', ')}\n\n本次先按现有账号继续执行，便于从 Telegram 汇总里确认已配置的账号列表。`;
    await safeNotify(msg);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  async function runOneAccount(acc, attempt = 1) {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      console.log(`正在为账号 ${acc.username} 执行签到... attempt=${attempt}`);
      await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 90000 });
      await login(page, acc);

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

      let status = 'uncertain';
      let note = '未见签到按钮，可能今日已签';

      if (clicked && changed) {
        status = attempt === 1 ? 'success' : 'retry-success';
        note = attempt === 1 ? '积分已变化' : '重试后积分已变化';
      } else if (clicked && !changed) {
        note = '已点击签到但积分未变化';
      }

      return { status, username: acc.username, before, after, note, clicked, changed, attempt };
    } finally {
      await page.close();
      await context.close();
    }
  }

  try {
    for (const acc of CONFIG.accounts) {
      try {
        let result = await runOneAccount(acc, 1);

        if (result.status === 'uncertain') {
          console.log(`${acc.username} 首次结果不确定，开始自动重试一次...`);
          await new Promise((resolve) => setTimeout(resolve, 4000));
          const retryResult = await runOneAccount(acc, 2);
          result = retryResult.status === 'retry-success' ? retryResult : {
            ...retryResult,
            status: retryResult.status === 'success' ? 'retry-success' : 'uncertain',
            note: retryResult.changed ? '重试后积分已变化' : '重试后仍未见积分变化/按钮'
          };
        }

        results.push(result);
      } catch (error) {
        console.error(`${acc.username} 失败:`, error.message);
        results.push({ status: 'failed', username: acc.username, error: error.message });
      }
    }
  } finally {
    await browser.close();
  }

  const summary = buildSummary(results, startedAt);
  await safeNotify(summary);

  const failedCount = results.filter((r) => r.status === 'failed').length;
  const uncertainCount = results.filter((r) => r.status === 'uncertain').length;
  if (failedCount > 0 || uncertainCount > 0) {
    throw new Error(`签到存在异常账号：failed=${failedCount}, uncertain=${uncertainCount}`);
  }
})();
