const { chromium } = require('playwright');
const axios = require('axios');

async function notifyTelegram(message) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message
        });
    } catch (error) {
        console.error('电报通知失败:', error.message);
    }
}

async function getPoints(page) {
    try {
        await page.waitForTimeout(2000);
        const text = await page.innerText('body');
        const match = text.match(/(?:余额|积分|当前积分)[:：]\s*([\d\.]+)/) || text.match(/([\d\.]+)\s*积分/);
        return match ? match[1] : '未知';
    } catch (e) {
        return '获取失败';
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const accounts = [
        { user: process.env.USER_1, pass: process.env.PASSWORD },
        { user: process.env.USER_2, pass: process.env.PASSWORD }
    ];

    for (const acc of accounts) {
        if (!acc.user) continue;
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            console.log(`正在签到: ${acc.user}`);
            await page.goto('https://one.idkey.cc/', { waitUntil: 'domcontentloaded' });
            
            // 改进后的登录逻辑：直接点击带 text 的按钮，增加重试
            console.log('点击登录按钮...');
            await page.locator('button:has-text("登录"), .btn-login').filter({ visible: true }).first().click({ timeout: 15000 });

            await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 10000 });
            await page.fill('input[placeholder*="名"], input[placeholder*="箱"], input[type="text"]', acc.user);
            await page.fill('input[type="password"]', acc.pass);
            await page.click('button:has-text("登录系统")');
            
            await page.waitForTimeout(6000);
            const pointsBefore = await getPoints(page);
            
            const signinBtn = page.locator('button:has-text("签到"), a:has-text("签到")').filter({ visible: true }).first();
            if (await signinBtn.count() > 0) {
                await signinBtn.click();
                await page.waitForTimeout(3000);
                const pointsAfter = await getPoints(page);
                await notifyTelegram(`账号: ${acc.user}\n签到成功！\n积分: ${pointsBefore} -> ${pointsAfter}`);
            } else {
                const current = await getPoints(page);
                await notifyTelegram(`账号: ${acc.user}\n今日已签到。\n当前积分: ${current}`);
            }
        } catch (e) {
            console.error(`签到异常: ${e.message}`);
            await notifyTelegram(`账号: ${acc.user}\n签到异常: ${e.message}`);
        } finally {
            await context.close();
        }
    }
    await browser.close();
})();
