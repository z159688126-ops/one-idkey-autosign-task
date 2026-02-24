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
        await page.waitForSelector('#displayStudentPoints', { state: 'visible', timeout: 20000 });
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
            await page.goto(CONFIG.url, { waitUntil: 'networkidle', timeout: 60000 });

            await page.evaluate(() => {
                document.querySelectorAll('#maintenanceOverlay, .modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open', 'scroll-locked');
                if (typeof openModal === 'function') openModal('login');
            });

            await page.waitForSelector('#loginUser', { state: 'visible', timeout: 15000 });
            await page.fill('#loginUser', acc.user);
            await page.fill('#loginPass', acc.pass);
            await page.click('#authModal .btn-action');
            
            await page.waitForTimeout(20000); 

            const p1 = await getPoints(page);
            console.log(`${acc.user} 签到前: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);

            // 精准锁定爸爸图中那个带日历的签到按钮
            const signinBtn = page.locator('.navbar, header').locator('button, a').filter({ hasText: '签到' }).first();
            
            if (await signinBtn.isVisible()) {
                console.log('按钮锁定，开始强制点击流程...');
                
                // 1. 模拟真实点击
                await signinBtn.click({ force: true, delay: 500 });
                
                // 2. 暴力扫射所有确认弹窗（针对 SweetAlert2 等 UI 框架）
                for (let i = 0; i < 5; i++) {
                    await page.waitForTimeout(2000);
                    const modalAction = await page.evaluate(() => {
                        const confirmBtn = document.querySelector('.swal2-confirm, .confirm, .btn-primary, button.ok');
                        if (confirmBtn) {
                            confirmBtn.click();
                            return true;
                        }
                        // 寻找包含特定文本的按钮
                        const anyOk = Array.from(document.querySelectorAll('button')).find(b => /确定|OK|知道了|提交/.test(b.innerText));
                        if (anyOk) {
                            anyOk.click();
                            return true;
                        }
                        return false;
                    });
                    if (modalAction) console.log('已强制点击弹窗确认');
                }

                // 3. 漫长等待并重载页面
                await page.waitForTimeout(30000);
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(5000);
                
                const p2 = await getPoints(page);

                let message = '';
                if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                    message = `[🎊 签到成功] 账号: ${acc.user}\n学生积分: 🎓 ${p1.student} -> ${p2.student}\n老兵积分: 🎖️ ${p1.veteran} -> ${p2.veteran}`;
                } else {
                    message = `[🔴 积分未跳] 账号: ${acc.user}\n当前积分: 🎓 ${p2.student} | 🎖️ ${p2.veteran}\n提示: 按钮已点且尝试清理弹窗，若仍未变动，请确认今日签到额度。`;
                }
                await notifyTelegram(message);
            } else {
                await notifyTelegram(`[⚠️ 未见按钮] 账号: ${acc.user}\n当前积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);
            }

        } catch (e) {
            await notifyTelegram(`[🚫 脚本错误] 账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
