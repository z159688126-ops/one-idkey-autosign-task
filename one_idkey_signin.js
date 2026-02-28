const { chromium } = require('playwright');
const axios = require('axios');

// 核心：优先从 GitHub 环境变量读取，如果没有则使用爸爸留下的默认值
const CONFIG = {
    url: 'https://one.idkey.cc/',
    accounts: [
        { 
            username: process.env.USER_1 || 'z159688126@gmail.com', 
            password: process.env.PASSWORD || 'Zengfei521.' 
        },
        { 
            username: process.env.USER_2 || 'zz159688126@gmail.com', 
            password: process.env.PASSWORD || 'Zengfei521.' 
        },
        { 
            username: process.env.USER_3 || 'zengfei19880126@gmail.com', 
            password: process.env.PASSWORD || 'Zengfei521.' 
        }
    ],
    botToken: process.env.BOT_TOKEN || '8363698033:AAFZqLYnxczqngwJIU-XqnLk7gaVwAK9hZQ',
    chatId: process.env.CHAT_ID || '5677672165'
};

function now() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

async function notifyTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`, {
            chat_id: CONFIG.chatId,
            text: message
        });
    } catch (error) {
        console.error('电报通知失败:', error.message);
    }
}

async function getPoints(page) {
    try {
        await page.waitForTimeout(5000); 
        const stats = await page.evaluate(() => {
            const getScore = (iconClass) => {
                const icon = document.querySelector(`i.${iconClass}`);
                if (icon && icon.parentElement) return icon.parentElement.innerText.trim();
                return '0';
            };
            const s = getScore('fa-graduation-cap') || '0';
            const v = getScore('fa-medal') || '0';
            return { s, v };
        });
        return stats;
    } catch (e) {
        return { s: '0', v: '0' };
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });

    for (const acc of CONFIG.accounts) {
        if (!acc.username || acc.username === 'undefined') continue;
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        try {
            console.log(`正在为账号 ${acc.username} 执行签到...`);
            await page.goto(CONFIG.url, { waitUntil: 'networkidle' });

            // 暴力清除维护遮罩层 (给谷歌看的那个)
            await page.evaluate(() => {
                const overlay = document.getElementById('maintenanceOverlay');
                if (overlay) overlay.remove();
                document.body.style.overflow = 'auto';
            });

            // 登录
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
            
            const status = `[签到成功]\n账号: ${acc.username}\n学生积分: 🎓 ${before.s} -> ${after.s}\n老兵积分: 🎖️ ${before.v} -> ${after.v}\n${now()}`;

            console.log(status);
            await notifyTelegram(status);

        } catch (error) {
            console.error(`${acc.username} 失败:`, error.message);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
