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
        await page.waitForSelector('#displayStudentPoints', { state: 'visible', timeout: 30000 });
        return await page.evaluate(() => {
            return {
                student: document.getElementById('displayStudentPoints')?.innerText || '0',
                veteran: document.getElementById('displayVeteranPoints')?.innerText || '0'
            };
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
            console.log(`正在登录: ${acc.user}`);
            await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 90000 });

            // 移除遮罩
            await page.evaluate(() => {
                document.querySelectorAll('#maintenanceOverlay, .modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open', 'scroll-locked');
                if (typeof openModal === 'function') openModal('login');
            });

            await page.waitForSelector('#loginUser', { state: 'visible', timeout: 20000 });
            await page.fill('#loginUser', acc.user);
            await page.fill('#loginPass', acc.pass);
            await page.click('#authModal .btn-action');
            
            await page.waitForTimeout(30000); // 登录后的超长缓冲

            const p1 = await getPoints(page);
            
            // 找到签到按钮
            const signinBtn = page.locator('button:has(i.fa-calendar-check), .btn-signin, button:has-text("签到")').first();
            
            if (await signinBtn.isVisible()) {
                console.log('执行点击并死守弹窗...');
                await signinBtn.click({ force: true });
                
                // 循环探测弹窗并点击确认，直到按钮消失或超时
                for (let j=0; j<10; j++) {
                    await page.waitForTimeout(2000);
                    const clicked = await page.evaluate(() => {
                        const ok = Array.from(document.querySelectorAll('button, a, div')).find(el => 
                            /确定|OK|知道了|提交|Close/.test(el.innerText) || el.classList.contains('swal2-confirm')
                        );
                        if (ok) { ok.click(); return true; }
                        return false;
                    });
                    if (clicked) console.log('已点击弹窗确认');
                }

                await page.waitForTimeout(20000);
                await page.reload({ waitUntil: 'networkidle' });
                const p2 = await getPoints(page);

                let message = '';
                if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                    message = `[🎉 签到成功]\n账号: ${acc.user}\n积分: 🎓 ${p1.student} -> ${p2.student} | 🎖️ ${p1.veteran} -> ${p2.veteran}`;
                } else {
                    message = `[⚠️ 还是不加分]\n账号: ${acc.user}\n当前积分: 🎓 ${p2.student} | 🎖️ ${p2.veteran}`;
                }
                await notifyTelegram(message);
            } else {
                await notifyTelegram(`[ℹ️ 没看到按钮]\n账号: ${acc.user}\n积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);
            }

        } catch (e) {
            await notifyTelegram(`[❌ 出错]\n账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
