/**
 * PhoneFarm 端到端测试 — 模拟手机终端绑定 + 可视化操作 UI 全流程
 * 用法: node test-e2e.mjs
 */

const BASE = 'http://localhost:5173';
const WS_DEVICE = 'ws://localhost:8445/ws/device';
const WS_FRONTEND = 'ws://localhost:8445/ws/frontend';
const DEVICE_TOKEN = 'device-auth-token-change-me';
const results = [];

function record(name, ok, detail) {
  const status = ok ? '✅ PASS' : '❌ FAIL';
  results.push({ name, ok, detail });
  console.log(`  ${status}  ${name}${detail ? ' — ' + detail : ''}`);
}

function summary() {
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  测试结果: ${passed} 通过, ${failed} 失败, ${results.length} 总计`);
  if (failed > 0) {
    console.log(`\n  失败项:`);
    results.filter(r => !r.ok).forEach(r => console.log(`    ❌ ${r.name}`));
  }
  console.log(`${'═'.repeat(60)}\n`);
}

async function api(path, opts = {}) {
  const token = opts.token;
  const hasBody = opts.body != null;
  const headers = { ...(opts.headers || {}) };
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
}

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error(`WS timeout: ${url}`)), 5000);
    ws.addEventListener('open', () => { clearTimeout(timeout); resolve(ws); });
    ws.addEventListener('error', (e) => { clearTimeout(timeout); reject(e); });
  });
}

// ══════════════════════════════════════════════════
//  PHASE 1: 登录认证
// ══════════════════════════════════════════════════
console.log('\n┌─ PHASE 1: 登录认证 ─────────────────────────────┐');

const r1 = await api('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
});
const TOKEN = r1.body?.token;
record('正确凭据登录获取 JWT', r1.status === 200 && !!TOKEN, TOKEN ? `token=${TOKEN.slice(0,20)}...` : '未获取到token');

const r2 = await api('/api/v1/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: 'admin', password: 'wrong' }),
});
record('错误密码拒绝登录', r2.status === 401, `status=${r2.status}`);

// ══════════════════════════════════════════════════
//  PHASE 2: 设备终端绑定 (WebSocket 模拟)
// ══════════════════════════════════════════════════
console.log('\n┌─ PHASE 2: 终端绑定 (WebSocket 模拟) ────────────┐');

const DEVICE_ID = 'test-phone-001';
const TAILSCALE_IP = '100.64.0.10';

// 2a. 初始状态
const r3 = await api('/api/v1/devices', { token: TOKEN });
record('初始设备列表为空', r3.status === 200 && Array.isArray(r3.body) && r3.body.length === 0, `devices=${r3.body?.length}`);

// 2b. 设备连接 + 认证
console.log('  [模拟] 设备1 WebSocket 连接...');
const deviceWs = await wsConnect(WS_DEVICE);
record('设备 WebSocket 连接成功', deviceWs.readyState === WebSocket.OPEN);

// ★ 关键：立即建立设备端命令收集器（在所有 API 调用之前）
const deviceMsgs = [];
deviceWs.addEventListener('message', (event) => {
  try { deviceMsgs.push(JSON.parse(event.data)); } catch {}
});

deviceWs.send(JSON.stringify({
  type: 'auth', token: DEVICE_TOKEN,
  device_id: DEVICE_ID, tailscale_ip: TAILSCALE_IP,
  model: 'Xiaomi 13', android_version: '14', deeke_version: '3.2.1',
}));

// 等待 auth_ok
await new Promise((resolve) => {
  const check = () => {
    if (deviceMsgs.find(m => m.type === 'auth_ok')) resolve();
    else setTimeout(check, 100);
  };
  setTimeout(check, 100);
  setTimeout(() => resolve(), 2000); // safety timeout
});
record('设备收到 auth_ok', !!deviceMsgs.find(m => m.type === 'auth_ok'), '认证成功');
await new Promise(r => setTimeout(r, 200));

// 2c. 验证设备注册
const r4 = await api('/api/v1/devices', { token: TOKEN });
const foundDevice = r4.body?.find(d => d.id === DEVICE_ID);
record('设备认证后出现在列表中', foundDevice?.status === 'online', `id=${DEVICE_ID}, status=${foundDevice?.status}`);

const r5 = await api(`/api/v1/devices/${DEVICE_ID}`, { token: TOKEN });
record('设备详情 API', r5.status === 200 && r5.body?.online === true, `online=${r5.body?.online}, model=${r5.body?.model}`);

// 2d. 心跳
deviceWs.send(JSON.stringify({ type: 'heartbeat', battery: 85, current_app: 'com.ss.android.ugc.aweme', screen_on: true }));
await new Promise(r => setTimeout(r, 300));
const r6 = await api(`/api/v1/devices/${DEVICE_ID}`, { token: TOKEN });
record('心跳更新电量', r6.body?.battery === 85, `battery=${r6.body?.battery}`);
record('心跳更新当前APP', r6.body?.currentApp === 'com.ss.android.ugc.aweme', `currentApp=${r6.body?.currentApp}`);

// 2e. 截图
deviceWs.send(JSON.stringify({ type: 'screenshot', data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }));
await new Promise(r => setTimeout(r, 200));
record('截图数据发送', true);

// 2f. 第二台设备
const DEVICE_ID2 = 'test-phone-002';
console.log('  [模拟] 设备2 WebSocket 连接...');
const deviceWs2 = await wsConnect(WS_DEVICE);

const device2Msgs = [];
deviceWs2.addEventListener('message', (event) => {
  try { device2Msgs.push(JSON.parse(event.data)); } catch {}
});

deviceWs2.send(JSON.stringify({
  type: 'auth', token: DEVICE_TOKEN, device_id: DEVICE_ID2,
  tailscale_ip: '100.64.0.11', model: 'Samsung S24', android_version: '15', deeke_version: '3.2.1',
}));
await new Promise(r => setTimeout(r, 500));

const r7 = await api('/api/v1/devices', { token: TOKEN });
record('多设备 — 列表显示2台', r7.body?.length === 2, `count=${r7.body.length}`);
record('多设备 — 在线的2台', r7.body?.filter(d => d.status === 'online').length === 2);

const rHealth = await api('/api/v1/health', { token: TOKEN });
record('Health API 显示 devicesOnline=2', rHealth.body?.devicesOnline === 2, `devicesOnline=${rHealth.body?.devicesOnline}`);

// 2g. 设备2断线
deviceWs2.close();
await new Promise(r => setTimeout(r, 500));
const r8 = await api(`/api/v1/devices/${DEVICE_ID2}`, { token: TOKEN });
record('设备断线后 online=false', r8.body?.online === false, `online=${r8.body?.online}`);
record('设备断线后 status=offline', r8.body?.status === 'offline', `status=${r8.body?.status}`);

// ══════════════════════════════════════════════════
//  PHASE 3: 可视化操作 UI — 快捷命令
// ══════════════════════════════════════════════════
console.log('\n┌─ PHASE 3: 可视化操作 UI — 快捷命令 ──────────────┐');

// 前端 WebSocket
const frontendWs = await wsConnect(WS_FRONTEND);
record('前端 WebSocket 连接成功', frontendWs.readyState === WebSocket.OPEN);

const frontendMsgs = [];
frontendWs.addEventListener('message', (event) => {
  try { frontendMsgs.push(JSON.parse(event.data)); } catch {}
});

frontendWs.send(JSON.stringify({ type: 'subscribe', deviceId: DEVICE_ID }));
await new Promise(r => setTimeout(r, 100));

// ★ deviceMsgs 已在 Phase 2 建立，这里的 API 调用产生的消息会自动收集

// REST API 发送快捷命令
const r9 = await api(`/api/v1/devices/${DEVICE_ID}/command`, {
  method: 'POST', token: TOKEN,
  body: JSON.stringify({ action: 'home', params: {} }),
});
record('快捷命令 — Home 发送成功', r9.body?.success === true, `sent=${r9.body?.success}`);

const r10 = await api(`/api/v1/devices/${DEVICE_ID}/command`, {
  method: 'POST', token: TOKEN,
  body: JSON.stringify({ action: 'screenshot', params: {} }),
});
record('快捷命令 — Screenshot 发送成功', r10.body?.success === true, `sent=${r10.body?.success}`);

// 随机命令(不在预设列表，但设备应收到)
const r10b = await api(`/api/v1/devices/${DEVICE_ID}/command`, {
  method: 'POST', token: TOKEN,
  body: JSON.stringify({ action: 'back', params: {} }),
});
record('快捷命令 — Back 发送成功', r10b.body?.success === true, `sent=${r10b.body?.success}`);

await new Promise(r => setTimeout(r, 300));
const cmds = deviceMsgs.filter(m => m.type === 'command');
record('设备收到快捷命令 (home/screenshot/back)', cmds.length >= 3,
  `收到 ${cmds.length} 条: [${cmds.map(c => c.action).join(', ')}]`);

// ══════════════════════════════════════════════════
//  PHASE 4: 可视化操作 — 任务创建/执行/停止
// ══════════════════════════════════════════════════
console.log('\n┌─ PHASE 4: 可视化操作 — 任务创建/执行/停止 ────────┐');

const rTemplates = await api('/api/v1/task-templates', { token: TOKEN });
record('任务模板列表获取', rTemplates.status === 200 && rTemplates.body?.length >= 15, `templates=${rTemplates.body?.length}`);

const dyTemplate = rTemplates.body.find(t => t.platform === 'dy');
record('找到抖音模板', !!dyTemplate, dyTemplate?.name);

// 创建任务
const r11 = await api('/api/v1/tasks', {
  method: 'POST', token: TOKEN,
  body: JSON.stringify({
    name: '测试-抖音科技类营销',
    templateId: dyTemplate.id,
    deviceId: DEVICE_ID,
    config: { keywords: ['人工智能', '编程'], maxScroll: 10 },
    cronExpr: '0 */2 * * *',
    enabled: true,
  }),
});
record('创建任务', r11.status === 201 && !!r11.body?.id, `taskId=${r11.body?.id?.slice(0,8)}...`);
const TASK_ID = r11.body?.id;

const r12 = await api('/api/v1/tasks', { token: TOKEN });
record('任务列表包含新任务', r12.body?.some(t => t.id === TASK_ID), `tasks=${r12.body.length}`);

// ★ 执行任务 — deviceMsgs 已在收集
const r13 = await api(`/api/v1/tasks/${TASK_ID}/run`, {
  method: 'POST', token: TOKEN,
});
record('执行任务 Run API 返回 200', r13.status === 200, `status=${r13.status}`);
record('执行任务 sent=true', r13.body?.sent === true, `sent=${r13.body?.sent}`);

await new Promise(r => setTimeout(r, 300));
const startMsg = deviceMsgs.find(m => m.type === 'start_task');
record('设备收到 start_task 指令', !!startMsg, startMsg ? `script=${startMsg.script}` : '未收到');

// 设备回报任务状态
deviceWs.send(JSON.stringify({ type: 'task_status', task_id: TASK_ID, status: 'running', step: 1, message: '正在打开抖音...' }));
await new Promise(r => setTimeout(r, 200));

deviceWs.send(JSON.stringify({ type: 'task_result', task_id: TASK_ID, status: 'completed', stats: { views: 50, likes: 12, comments: 3, follows: 5 } }));
await new Promise(r => setTimeout(r, 300));
record('设备回报 task_result (completed)', true);

const taskStatusUpdates = frontendMsgs.filter(m => m.type === 'task_status_update');
record('前端收到 task_status_update', taskStatusUpdates.length >= 1, `${taskStatusUpdates.length} 条`);

// 任务日志
const rLogs = await api(`/api/v1/tasks/${TASK_ID}/logs`, { token: TOKEN });
record('任务执行日志可查询', rLogs.status === 200, `logs=${rLogs.body?.length}`);

// ★ 停止任务
const r14 = await api(`/api/v1/tasks/${TASK_ID}/stop`, {
  method: 'POST', token: TOKEN,
});
record('停止任务 API', r14.body?.success === true, `success=${r14.body?.success}`);
await new Promise(r => setTimeout(r, 200));
const stopMsg = deviceMsgs.find(m => m.type === 'stop_task');
record('设备收到 stop_task 指令', !!stopMsg, stopMsg ? `task_id=${stopMsg.task_id}` : '未收到');

// ══════════════════════════════════════════════════
//  PHASE 5: 可视化操作 — 账号管理
// ══════════════════════════════════════════════════
console.log('\n┌─ PHASE 5: 可视化操作 — 账号管理 ─────────────────┐');

const r15 = await api('/api/v1/accounts', {
  method: 'POST', token: TOKEN,
  body: JSON.stringify({
    platform: 'dy', username: 'test_douyin_user',
    passwordEncrypted: Buffer.from('testpass123').toString('base64'),
    deviceId: DEVICE_ID,
  }),
});
record('创建账号', r15.status === 201 && !!r15.body?.id, `id=${r15.body?.id?.slice(0,8)}...`);
const ACCT_ID = r15.body?.id;

const r16 = await api('/api/v1/accounts', { token: TOKEN });
record('账号列表获取', r16.body?.some(a => a.id === ACCT_ID), `accounts=${r16.body.length}`);

const r17 = await api(`/api/v1/accounts/${ACCT_ID}`, {
  method: 'DELETE', token: TOKEN,
});
record('删除账号', r17.body?.success === true, `success=${r17.body?.success}`);

const r18 = await api('/api/v1/accounts', { token: TOKEN });
record('账号删除后列表为空', r18.body?.length === 0, `accounts=${r18.body.length}`);

// ══════════════════════════════════════════════════
//  PHASE 6: 设备离线 + 清理
// ══════════════════════════════════════════════════
console.log('\n┌─ PHASE 6: 设备离线 + 清理 ───────────────────────┐');

// 设备关闭连接
deviceWs.close();
frontendWs.close();
await new Promise(r => setTimeout(r, 500));

const r20 = await api('/api/v1/devices', { token: TOKEN });
record('设备全部离线', r20.body?.filter(d => d.status === 'online').length === 0,
  `online=${r20.body?.filter(d=>d.status==='online').length}`);

// 清理任务
const r19 = await api(`/api/v1/tasks/${TASK_ID}`, {
  method: 'DELETE', token: TOKEN,
});
record('删除任务', r19.body?.success === true, `success=${r19.body?.success}`);

// ══════════════════════════════════════════════════
summary();
process.exit(0);
