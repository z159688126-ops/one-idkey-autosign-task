const { chromium } = require('playwright');
const axios = require('axios');

const CONFIG = {
    url: 'https://one.idkey.cc/',
    accounts: [
        { user: 'z159688126@gmail.com', pass: 'Zengfei521.' },
        { user: 'zz159688126@gmail.com', pass: 'Zengfei521.' },
        { user: 'zengfei19880126@gmail.com', pass: 'Zengfei521.Zengfei521.' }
    ],
    botToken: '8363698033:AAFZqLYnxczqngwJIU-XqnLk7gaVwAK9hZQ',
    chatId: '5677672165'
};

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
        await page.waitForSelector('#displayStudentPoints', { timeout: 20000 }).catch(() => {});
        return await page.evaluate(() => {
            const student = document.getElementById('displayStudentPoints')?.innerText || '0';
            const veteran = document.getElementById('displayVeteranPoints')?.innerText || '0';
            return { student, veteran };
        });
    } catch (e) {
        return { student: '?', veteran: '?' };
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });

    for (const acc of CONFIG.accounts) {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        
        try {
            console.log(`正在登录账号: ${acc.user}`);
            await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 60000 });

            // 移除干扰并触发登录
            await page.evaluate(() => {
                const overlay = document.getElementById('maintenanceOverlay');
                if (overlay) overlay.remove();
                document.body.classList.remove('scroll-locked');
                if (typeof openModal === 'function') openModal('login');
            });

            await page.waitForSelector('#loginUser', { state: 'visible', timeout: 15000 });
            await page.fill('#loginUser', acc.user);
            await page.fill('#loginPass', acc.pass);
            
            // 点击登录并等待
            await page.click('#authModal .btn-action');
            await page.waitForTimeout(20000); // 登录后的关键等待

            const p1 = await getPoints(page);
            console.log(`${acc.user} 签到前: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);

            // 像人一样定位并点击签到
            // 按钮特征：包含 fa-calendar-check 图标的按钮
            const signinBtn = page.locator('button:has(i.fa-calendar-check), .btn-signin, button:has-text("签到")').first();
            
            let message = '';
            if (await signinBtn.isVisible()) {
                console.log('按钮可见，模拟人手点击...');
                // 模拟鼠标悬停、按下、延迟后松开
                await signinBtn.hover();
                await page.waitForTimeout(1000);
                await signinBtn.click({ delay: 500, force: true });
                
                // 疯狂处理可能出现的确认弹窗
                await page.waitForTimeout(3000);
                await page.evaluate(() => {
                    const okBtns = Array.from(document.querySelectorAll('button')).filter(b => /确定|OK|知道了/.test(b.innerText));
                    okBtns.forEach(b => b.click());
                });

                // 点完后死等 30 秒，不准刷新，给服务器加载时间
                console.log('等待积分同步...');
                await page.waitForTimeout(30000);
                
                // 刷新一下页面再抓
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(5000);
                const p2 = await getPoints(page);

                if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                    message = `[✅ 签到成功]\n账号: ${acc.user}\n学生积分: 🎓 ${p1.student} -> ${p2.student}\n老兵积分: 🎖️ ${p1.veteran} -> ${p2.veteran}`;
                } else {
                    message = `[⚠️ 签到无变动]\n账号: ${acc.user}\n原因: 按钮已点但分没涨。可能今天已经签过了。\n当前积分: 🎓 ${p2.student} | 🎖️ ${p2.veteran}`;
                }
            } else {
                message = `[ℹ️ 已签到/未找到按钮]\n账号: ${acc.user}\n积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`;
            }

            console.log(message);
            await notifyTelegram(message);

        } catch (e) {
            console.error(`${acc.user} 出错: ${e.message}`);
            await notifyTelegram(`[❌ 异常]\n账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
