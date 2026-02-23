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
        await page.waitForTimeout(5000);
        const text = await page.innerText('body');
        const match = text.match(/(?:余额|积分|当前积分|可用积分)[:：]\s*([\d\.]+)/i) || text.match(/([\d\.]+)\s*(?:积分|点)/);
        if (match) return match[1];
        return '无法解析';
    } catch (e) {
        return '获取失败';
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const accounts = [
        { user: process.env.USER_1, pass: process.env.PASSWORD },
        { user: process.env.USER_2, pass: process.env.PASSWORD }
    ];

    for (const acc of accounts) {
        if (!acc.user) continue;
        const page = await context.newPage();
        try {
            console.log(`正在为账号 ${acc.user} 执行签到...`);
            await page.goto('https://one.idkey.cc/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            console.log('寻找登录按钮...');
            const loginBtn = page.locator('button:has-text("登录"), a:has-text("登录"), .btn-login, #loginBtn').first();
            await loginBtn.click({ timeout: 30000, force: true });

            console.log('等待登录框...');
            await page.waitForSelector('input[type="password"]', { state: 'attached', timeout: 20000 });
            await page.fill('input[placeholder*="用户名"], input[placeholder*="邮箱"], input[type="text"]', acc.user);
            await page.fill('input[type="password"]', acc.pass);
            
            console.log('提交登录...');
            const submitBtn = page.locator('button:has-text("登录系统"), .btn-action, button[onclick*="performLogin"]').first();
            await submitBtn.click({ timeout: 30000, force: true });
            
            await page.waitForTimeout(10000);
            const pointsBefore = await getPoints(page);
            
            console.log('检查签到状态...');
            const signinBtn = page.locator('button:has-text("签到"), a:has-text("签到"), .btn-signin').first();
            
            if (await signinBtn.isVisible()) {
                console.log('执行签到点击...');
                await signinBtn.click({ force: true });
                await page.waitForTimeout(3000);
                const pointsAfter = await getPoints(page);
                await notifyTelegram(`账号: ${acc.user}\n签到成功！\n积分: ${pointsBefore} -> ${pointsAfter}`);
            } else {
                const current = await getPoints(page);
                await notifyTelegram(`账号: ${acc.user}\n今日已签到或未找到签到按钮。\n当前积分: ${current}`);
            }
        } catch (e) {
            console.error(`签到异常: ${e.message}`);
            await notifyTelegram(`账号: ${acc.user}\n签到异常: ${e.message}`);
        } finally {
            await page.close();
        }
    }
    await browser.close();
})();
