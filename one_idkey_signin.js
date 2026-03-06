const { chromium } = require('playwright');
const axios = require('axios');

const accountNames = Array.from({ length: 10 }, (_, i) => process.env[`USER_${i + 1}`]).filter(
  (u) => u && u !== 'undefined'
);

const CONFIG = {
  url: 'https://one.idkey.cc/',
  accounts: accountNames.map((username) => ({
    username,
    password: process.env.PASSWORD || 'Zengfei521.'
  })),
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

  await axios.post(`https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`, {
    chat_id: CONFIG.chatId,
    text: message,
    disable_web_page_preview: true
  }, {
    timeout: 30000
  });
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
    await page.waitForTimeout(5000);
    return await page.evaluate(() => {
      const getScore = (iconClass) => {
        const icon = document.querySelector(`i.${iconClass}`);
        if (icon && icon.parentElement) return icon.parentElement.innerText.trim();
        return '0';
      };
      return { s: getScore('fa-graduation-cap'), v: getScore('fa-medal') };
    });
  } catch {
    return { s: '0', v: '0' };
  }
}

function buildSummary(results, startedAt) {
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  const lines = [
    '[GitHub 签到汇总]',
    `时间: ${startedAt}`,
    `账户数: ${results.length}/10`,
    `成功: ${ok.length}`,
    `失败: ${fail.length}`,
    ''
  ];

  if (ok.length) {
    lines.push('✅ 成功账号');
    for (const item of ok) {
      lines.push(`- ${item.username} | 🎓 ${item.before.s} -> ${item.after.s} | 🎖️ ${item.before.v} -> ${item.after.v}`);
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

  return lines.join('\n').trim();
}

(async () => {
  const startedAt = now();

  if (CONFIG.accounts.length !== 10) {
    const msg = `[GitHub 签到异常]\n时间: ${startedAt}\n当前只配置了 ${CONFIG.accounts.length}/10 个账号\n缺少的 Secrets: ${Array.from({ length: 10 }, (_, i) => `USER_${i + 1}`).filter((k) => !process.env[k]).join(', ')}`;
    await safeNotify(msg);
    throw new Error(`账号数量不足：${CONFIG.accounts.length}/10`);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const acc of CONFIG.accounts) {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      try {
        console.log(`正在为账号 ${acc.username} 执行签到...`);
        await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 60000 });

        await page.evaluate(() => {
          const overlay = document.getElementById('maintenanceOverlay');
          if (overlay) overlay.remove();
          document.body.style.overflow = 'auto';
        });

        const loginBtn = page.locator('button:has-text("登录"), .btn-login').filter({ visible: true }).first();
        await loginBtn.waitFor({ state: 'visible', timeout: 30000 });
        await loginBtn.click();

        await page.fill('input[placeholder*="用户名"], input[placeholder*="邮箱"], input[type="text"]', acc.username);
        await page.fill('input[type="password"]', acc.password);
        await page.click('button:has-text("登录系统")');
        await page.waitForTimeout(10000);

        const before = await getPoints(page);
        const signinBtn = page.locator('button:has-text("签到"), a:has-text("签到")').filter({ visible: true }).first();
        if (await signinBtn.count() > 0) {
          await signinBtn.click({ force: true });
          await page.waitForTimeout(5000);
        }

        const after = await getPoints(page);
        results.push({ ok: true, username: acc.username, before, after });
      } catch (error) {
        console.error(`${acc.username} 失败:`, error.message);
        results.push({ ok: false, username: acc.username, error: error.message });
      } finally {
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
  if (failedCount > 0) {
    throw new Error(`签到存在失败账号：${failedCount}`);
  }
})();
