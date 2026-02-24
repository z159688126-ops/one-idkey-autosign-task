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
        // 使用文本内容定位积分，这是最稳的，不受 ID 变化影响
        const student = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('div, span, p')).find(e => e.innerText.includes('学生积分'));
            return el ? el.innerText.split(' ').pop() : '0';
        });
        const veteran = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('div, span, p')).find(e => e.innerText.includes('老兵积分'));
            return el ? el.innerText.split(' ').pop() : '0';
        });
        return { student, veteran };
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
            console.log(`正在登录: ${acc.user}`);
            await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 90000 });

            // 移除干扰
            await page.evaluate(() => {
                document.querySelectorAll('#maintenanceOverlay, .modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open', 'scroll-locked');
                if (typeof openModal === 'function') openModal('login');
            });

            await page.waitForSelector('input[type="text"], #loginUser', { state: 'visible', timeout: 20000 });
            await page.fill('input[type="text"]', acc.user);
            await page.fill('input[type="password"]', acc.pass);
            await page.click('button:has-text("登录"), .btn-action');
            
            await page.waitForTimeout(20000); 

            const p1 = await getPoints(page);
            console.log(`${acc.user} 初始积分: 学生 ${p1.student} | 老兵 ${p1.veteran}`);

            // 精准点击那个带日历图标的“签到”按钮
            const signinBtn = page.getByRole('button', { name: /签到/ }).first();
            
            if (await signinBtn.isVisible()) {
                console.log('执行模拟点击...');
                await signinBtn.click({ force: true, delay: 500 });
                
                // 处理弹窗
                await page.waitForTimeout(5000);
                await page.evaluate(() => {
                    const ok = Array.from(document.querySelectorAll('button, a')).find(el => /确定|OK|知道了|提交/.test(el.innerText));
                    if (ok) ok.click();
                });

                // 等待并刷新
                await page.waitForTimeout(25000);
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(5000);
                
                const p2 = await getPoints(page);

                let message = '';
                if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                    message = `[🎉 签到成功] 账号: ${acc.user}\n学生积分: 🎓 ${p1.student} -> ${p2.student}\n老兵积分: 🎖️ ${p1.veteran} -> ${p2.veteran}`;
                } else {
                    message = `[⚠️ 积分未变] 账号: ${acc.user}\n当前积分: 🎓 ${p2.student} | 🎖️ ${p2.veteran}\n提示: 已尝试点击，若数字没跳，可能是今日额度已签完。`;
                }
                await notifyTelegram(message);
            } else {
                await notifyTelegram(`[ℹ️ 未见按钮] 账号: ${acc.user}\n积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);
            }

        } catch (e) {
            await notifyTelegram(`[🚫 报错] 账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
