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
        // 强制等待积分加载
        await page.waitForSelector('#displayStudentPoints', { timeout: 15000 }).catch(() => {});
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

            // 登录后多等一会儿
            await page.waitForTimeout(15000);
            const p1 = await getPoints(page);
            console.log(`${acc.user} 签到前: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);

            // 暴力搜索“签到”按钮
            const signinBtn = page.locator('button:has-text("签到"), .btn-signin, i.fa-calendar-check').first();
            
            let message = '';
            const isVisible = await signinBtn.isVisible();
            
            if (isVisible) {
                console.log('发现签到按钮，执行点击...');
                // 尝试两种点击方式：Playwright 点击和 JS 原生点击
                await signinBtn.click({ force: true }).catch(() => {});
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('签到'));
                    if (btn) btn.click();
                });

                // 点击后等待较长时间，并刷新页面以获取最新积分
                await page.waitForTimeout(15000);
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(5000);

                const p2 = await getPoints(page);
                if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                    message = `[签到成功]\n账号: ${acc.user}\n学生积分: 🎓 ${p1.student} -> ${p2.student}\n老兵积分: 🎖️ ${p1.veteran} -> ${p2.veteran}`;
                } else {
                    message = `[签到未增益]\n账号: ${acc.user}\n原因: 按钮已点但积分未变，可能已过今日限制或网络延迟\n当前积分: 🎓 ${p2.student} | 🎖️ ${p2.veteran}`;
                }
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
