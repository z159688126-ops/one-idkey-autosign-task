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

            // 移除干扰
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
                    const btn = document.querySelector('#authModal .btn-action');
                    if (btn) btn.click();
                }
            });

            await page.waitForTimeout(15000);
            const p1 = await getPoints(page);
            console.log(`${acc.user} 签到前: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`);

            // 执行签到
            console.log('正在执行暴力签到逻辑...');
            await page.evaluate(async () => {
                // 1. 尝试直接调用网页内置的签到函数 (如果是这个名字的话)
                if (typeof userCheckin === 'function') {
                    await userCheckin();
                } else if (typeof signin === 'function') {
                    await signin();
                }
                
                // 2. 模拟点击所有可能的签到按钮
                const btns = Array.from(document.querySelectorAll('button, a, span')).filter(el => 
                    el.innerText.includes('签到') || el.classList.contains('btn-signin')
                );
                btns.forEach(b => b.click());

                // 3. 处理可能出现的“确认”弹窗
                const confirmBtns = Array.from(document.querySelectorAll('button')).filter(b => 
                    b.innerText.includes('确定') || b.innerText.includes('OK') || b.innerText.includes('知道了')
                );
                confirmBtns.forEach(b => b.click());
            });

            // 给服务器反应时间并刷新
            await page.waitForTimeout(15000);
            await page.reload({ waitUntil: 'networkidle' });
            await page.waitForTimeout(5000);

            const p2 = await getPoints(page);
            
            let message = '';
            if (p1.student !== p2.student || p1.veteran !== p2.veteran) {
                message = `[🎉 签到成功]\n账号: ${acc.user}\n学生积分: 🎓 ${p1.student} -> ${p2.student}\n老兵积分: 🎖️ ${p1.veteran} -> ${p2.veteran}`;
            } else {
                // 如果没变，看看是不是已经签过了
                const alreadyDone = await page.evaluate(() => document.body.innerText.includes('今日已签到') || document.body.innerText.includes('请明天再来'));
                if (alreadyDone) {
                    message = `[今日已签到]\n账号: ${acc.user}\n当前积分: 🎓 ${p1.student} | 🎖️ ${p1.veteran}`;
                } else {
                    message = `[签到未生效]\n账号: ${acc.user}\n提示: 已尝试暴力签到但积分未涨，可能是今日额度已满或需要手动验证。`;
                }
            }

            console.log(message);
            await notifyTelegram(message);

        } catch (e) {
            console.error(`${acc.user} 出错: ${e.message}`);
            await notifyTelegram(`[异常报告]\n账号: ${acc.user}\n原因: ${e.message}`);
        } finally {
            await page.close();
            await context.close();
        }
    }
    await browser.close();
})();
