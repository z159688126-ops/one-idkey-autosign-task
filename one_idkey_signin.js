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
        await page.waitForSelector('#displayStudentPoints', { timeout: 10000 }).catch(() => {});
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

            await page.evaluate(() => {
                const overlay = document.getElementById('maintenanceOverlay');
                if (overlay) overlay.remove();
                document.body.classList.remove('scroll-locked');
                if (typeof openModal === 'function') openModal('login');
            });

            await page.waitForSelector('#loginUser', { state: 'visible', timeout: 15000 });
            await page.fill('#loginUser', acc.user);
            await page.fill('#loginPass', acc.pass);
            
            await page.evaluate(() => {
                if (typeof performLogin === 'function') {
                    performLogin();
                } else {
                    document.querySelector('#authModal .btn-action').click();
                }
            });

            await page.waitForTimeout(15000);
            const p1 = await getPoints(page);
            console.log(`${acc.user} 签到前: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);

            // 关键修复：精确定位老兵积分后面的签到按钮
            // 按钮就在 #displayVeteranPoints 的父元素或兄弟元素中
            const signinBtn = page.locator('#displayVeteranPoints + button, #displayVeteranPoints ~ button, button:has(i.fa-calendar-check), .btn-signin').first();
            
            let message = '';
            if (await signinBtn.isVisible()) {
                console.log('执行签到...');
                // 强制点击，防止被遮挡
                await signinBtn.click({ force: true });
                await page.waitForTimeout(10000); 
                const p2 = await getPoints(page);
                message = `[签到成功]\n账号: ${acc.user}\n学生积分: 🎓 ${p1.student} -> ${p2.student}\n老兵积分: 🎖️ ${p1.veteran} -> ${p2.veteran}`;
            } else {
                message = `[今日已签到]\n账号: ${acc.user}\n当前积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`;
            }

            console.log(message);
            await notifyTelegram(message);

        } catch (e) {
            console.error(`${acc.user} 出错: ${e.message}`);
            await notifyTelegram(`[签到异常]\n账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
