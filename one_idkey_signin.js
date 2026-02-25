const { chromium } = require('playwright');
const axios = require('axios');

const CONFIG = {
  url: 'https://one.idkey.cc/',
  accounts: [
    { user: 'z159688126@gmail.com', pass: 'Zengfei521.' },
    { user: 'zz159688126@gmail.com', pass: 'Zengfei521.' },
    { user: 'zengfei19880126@gmail.com', pass: 'Zengfei521.Zengfei521.' }
  ]
};

async function logSilent(message) {
    // 爸爸说了，不要电报通知，所以只打印在控制台
    console.log('[SILENT LOG]:', message);
}

async function getPoints(page) {
    try {
        const student = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('div, span, p')).find(e => e.innerText.includes('学生积分'));
            return el ? el.innerText.split(' ').pop() : '0';
        });
        const veteran = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('div, span, p')).find(e => e.innerText.includes('老兵积分'));
            return el ? el.innerText.split(' ').pop() : '0';
        });
        return `学生: ${student} | 老兵: ${veteran}`;
    } catch (e) {
        return '获取失败';
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    for (const acc of CONFIG.accounts) {
        const page = await context.newPage();
        try {
            console.log(`正在登录: ${acc.user}`);
            await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            // 登录流程
            await page.click('button:has-text("登录")');
            await page.fill('input[placeholder*="用户名"], input[placeholder*="邮箱"]', acc.user);
            await page.fill('input[type="password"]', acc.pass);
            await page.click('button:has-text("登录系统")');
            
            await page.waitForTimeout(5000);
            const pointsBefore = await getPoints(page);
            
            // 签到动作
            const signinBtn = page.locator('button:has-text("签到"), a:has-text("签到")').first();
            if (await signinBtn.isVisible()) {
                await signinBtn.click();
                await page.waitForTimeout(3000);
                const pointsAfter = await getPoints(page);
                await logSilent(`账号: ${acc.user} 签到成功！积分: [${pointsBefore}] -> [${pointsAfter}]`);
            } else {
                const current = await getPoints(page);
                await logSilent(`账号: ${acc.user} 今日已签。当前积分: [${current}]`);
            }
        } catch (e) {
            await logSilent(`账号: ${acc.user} 执行异常: ${e.message}`);
        } finally {
            await page.close();
        }
    }
    await browser.close();
})();
