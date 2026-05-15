# PhoneFarm 统一开发规范 v1.0

## 1. TypeScript (后端 + 前端)

### 1.1 类型安全
- **禁止 `any`** — 新代码全部显式类型，存量 `any` 逐步消除
- **API 契约类型化** — 请求/响应定义 `interface`，禁止 `as any` 绕过
- **Zod schema** — 所有 REST 端点入参用 Zod 校验，POST/PUT 必校验 body

### 1.2 错误处理
- **HTTP 响应格式统一**: `{ success: boolean, data?: T, error?: string }`
- **状态码规范**: 200 成功 / 201 创建 / 400 参数错误 / 401 未认证 / 403 无权限 / 404 不存在 / 409 冲突 / 429 限流 / 500 服务错误 / 502 上游不可用 / 503 服务未就绪
- **catch 必须**: (1) 更新 loading=false (2) 设置 error 状态 (3) 记录日志
- **Fastify** 使用 `reply.status(code).send(...)` 明确设置状态码

### 1.3 安全
- **安全头**: 所有响应包含 CSP / X-Frame-Options / X-Content-Type-Options / HSTS
- **CORS**: 生产环境白名单域名，禁止 `origin: true`
- **频率限制**: 全局 `@fastify/rate-limit`，auth 端点严格限制 (5次/分钟/IP)
- **Body 限制**: 全局 1MB，文件上传路由单独放宽
- **XSS**: 前端 `dangerouslySetInnerHTML` 必须先 `escapeHtml()` 再渲染 markdown
- **SQL**: Drizzle ORM 参数化查询，禁止字符串拼接 SQL

### 1.4 命名规范
- **文件**: kebab-case (`admin-assistant-executor.ts`)
- **函数/变量**: camelCase (`getDeviceList`)
- **类型/接口**: PascalCase (`DeviceSlice`)
- **常量**: UPPER_SNAKE_CASE (`MAX_TOOL_LOOP_ITERATIONS`)
- **数据库列**: snake_case (`device_id`)
- **JSON 字段**: camelCase (前后端一致)
- **WebSocket 消息类型**: snake_case (与已有协议兼容)

## 2. React 前端

### 2.1 组件规范
- **每个组件一个文件** — 禁止多个组件挤在同一文件
- **`React.memo`** — 纯展示组件默认包裹
- **`useCallback`/`useMemo`** — 传递给子组件的回调/计算值
- **Zustand selector** — 精准选择字段，禁止 `useStore(s => s)` 全量订阅

### 2.2 状态管理
- **API 缓存**: mutation 后必须调 `invalidateCache()` 清除对应路径缓存
- **Loading 状态**: 每个 async action 必须有 try/catch/finally 完整状态循环
- **localStorage**: QuotaExceededError 保护

### 2.3 UI/UX
- **响应式**: 所有页面/组件支持 sm/md/lg 断点
- **移动端**: 侧栏/面板改为全屏模式 (max-sm:inset-0)
- **暗色模式**: 所有颜色类必须包含 `dark:` 变体
- **动画**: 出现用 `animate-slide-in-right`/`animate-slide-up`，消失用对应 `slide-out-*`
- **加载骨架**: 统一用 `SkeletonText`，不用原始 spinner

### 2.4 无障碍 (WCAG 2.1 AA)
- **图标按钮**: 必须有 `aria-label`
- **表单输入**: 必须有 `<label>` 或 `aria-label`
- **下拉菜单**: 必须 `aria-expanded={open}`
- **模态**: 必须 `role="dialog"` + `aria-modal="true"` + Escape 关闭
- **键盘**: 所有交互元素可用 Tab 导航，Enter/Space 激活

## 3. Kotlin Android

### 3.1 线程安全
- **禁止主线程阻塞** — 禁止 `runBlocking`，用 `suspend` + `withContext(Dispatchers.IO)`
- **协程作用域**: ViewModel 用 `viewModelScope`，Service 用自定义 `CoroutineScope(SupervisorJob() + Dispatchers.Main)`
- **GlobalScope 禁止**: 必须用 lifecycle-aware scope

### 3.2 进程/生命周期
- **跨进程通信**: 用 `currentTimeMillis()` 而非 `elapsedRealtime()`
- **进程死亡恢复**: 关键状态存 Room/DataStore
- **onTrimMemory**: 前台 Service 必须 override，释放非关键资源

### 3.3 安全
- **路径穿越**: 文件操作前校验规范化为 app 内部目录
- **加密异常**: 不静默吞异常，抛 `EncryptionException`
- **TLS**: 所有连接用 CertificatePinner

### 3.4 网络
- **重连**: 必须有最大重试次数 (10次)
- **离线队列**: 断线消息入队，重连后出队发送
- **异常分类**: `when(t)` 映射到正确的 `DisconnectReason`

### 3.5 持久化
- **Room 迁移**: 禁止 `fallbackToDestructiveMigration()`，必须写 Migration
- **崩溃日志**: 同步写文件优先，Room 异步写入为辅助

## 4. API 设计

### 4.1 REST
- **路径**: `/api/v1/resource` / `/api/v2/resource`
- **响应格式**: `{ success: boolean, data?: T, error?: string, pagination?: {...} }`
- **分页**: `{ page, pageSize, total, totalPages }`

### 4.2 WebSocket
- **消息类型命名**: snake_case 统一 (`device_online`, `task_status`)
- **字段命名**: camelCase (与 JSON 习惯一致)

### 4.3 NATS
- **Subject**: `phonefarm.{resource}.{id}.{event}` 统一模式
- **JSON 字段**: camelCase，与 REST API 一致

## 5. Git 规范

### 5.1 Commit
- **格式**: `<type>(<scope>): <描述>` (例: `fix(android): 修复 runBlocking ANR`)
- **Type**: feat / fix / refactor / perf / security / style / docs
- **禁止 amend 已推送的 commit / 禁止 force push main**

### 5.2 Code Review 检查清单
- [ ] 类型安全 (无 `any`)
- [ ] 错误处理完整 (try/catch + loading + error)
- [ ] 安全 (XSS/SQL注入/路径穿越)
- [ ] 响应式 (sm/md/lg)
- [ ] 暗色模式
- [ ] 无障碍 (aria-label)
- [ ] 缓存失效 (mutation 后)
