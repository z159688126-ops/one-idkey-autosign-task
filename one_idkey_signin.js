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

            // 1. 强力清场：移除所有遮罩和锁定
            await page.evaluate(() => {
                document.querySelectorAll('#maintenanceOverlay, .modal-backdrop, .fade.show').forEach(el => el.remove());
                document.body.classList.remove('modal-open', 'scroll-locked');
                if (typeof openModal === 'function') openModal('login');
            });

            await page.waitForSelector('#loginUser', { state: 'visible', timeout: 15000 });
            await page.fill('#loginUser', acc.user);
            await page.fill('#loginPass', acc.pass);
            await page.click('#authModal .btn-action');
            
            // 登录后的缓冲
            await page.waitForTimeout(20000); 

            const p1 = await getPoints(page);
            console.log(`${acc.user} 签到前: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);

            // 2. 定位那个带日历的按钮
            const signinBtn = page.locator('button:has(i.fa-calendar-check), .btn-signin, button:has-text("签到")').first();
            
            if (await signinBtn.isVisible()) {
                console.log('执行模拟点击...');
                await signinBtn.click({ force: true, delay: 200 });
                
                // 3. 关键：等待并点击弹出的“确定”按钮
                await page.waitForTimeout(5000);
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, a.btn'));
                    const okBtn = btns.find(b => /确定|OK|知道了|提交/.test(b.innerText));
                    if (okBtn) okBtn.click();
                });

                // 4. 点完等积分同步
                await page.waitForTimeout(25000);
                await page.reload({ waitUntil: 'networkidle' });
                const p2 = await getPoints(page);

                let message = '';
                if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                    message = `[✅ 签到成功]\n账号: ${acc.user}\n积分: 🎓 ${p1.student} -> ${p2.student} | 🎖️ ${p1.veteran} -> ${p2.veteran}`;
                } else {
                    message = `[⚠️ 状态更新]\n账号: ${acc.user}\n可能今日已签过，积分未变动。\n当前: 🎓 ${p2.student} | 🎖️ ${p2.veteran}`;
                }
                await notifyTelegram(message);
            } else {
                await notifyTelegram(`[ℹ️ 未找到按钮]\n账号: ${acc.user}\n积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);
            }

        } catch (e) {
            await notifyTelegram(`[❌ 错误]\n账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
