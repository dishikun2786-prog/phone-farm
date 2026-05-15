# PhoneFarm 统一开发规范 v1.0

> 适用于所有代码层：TypeScript 后端 (control-server)、React 前端 (dashboard)、Kotlin Android (android-client)

---

## 一、TypeScript/Node.js 后端规范

### 1.1 内存管理

| 规则 | 说明 |
|------|------|
| **R-001** | 所有持有定时器/Map/Set/订阅的单例类必须提供 `dispose()` 或 `shutdown()` 方法 |
| **R-002** | `setTimeout`/`setInterval` 返回值必须存储，在 dispose 中 `clearTimeout`/`clearInterval` |
| **R-003** | EventEmitter 监听器在 dispose 中必须 `removeAllListeners()` |
| **R-004** | 无界数组（如 session history）必须有最大容量限制，超出时移除最旧条目 |
| **R-005** | 禁止在热路径（WebSocket message handler）中使用 `require()` 动态加载 |

### 1.2 数据库

| 规则 | 说明 |
|------|------|
| **R-006** | pg Pool 必须配置: `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` |
| **R-007** | pg Pool 必须注册 `pool.on('error')` 处理器 |
| **R-008** | 优雅关闭中必须调用 `pool.end()` |
| **R-009** | Drizzle 模式定义中所有外键列和常用查询列必须声明 `.index()` |
| **R-010** | 所有 `timestamp` 类型的查询列必须声明索引 |
| **R-011** | `drizzle.config.ts` 必须包含项目中所有 schema 文件 |
| **R-012** | 禁止使用内存 Map/Set 作为持久化数据的唯一存储（必须有 DB 持久化） |

### 1.3 安全

| 规则 | 说明 |
|------|------|
| **R-013** | JWT 验证必须校验签名，禁止仅解码 payload 而不验证 |
| **R-014** | 使用 `@fastify/jwt` 插件进行 JWT 操作，禁止手动 JWT 构建/验证 |
| **R-015** | WebSocket 认证 token 禁止通过 URL 查询参数传递 |

### 1.4 类型安全

| 规则 | 说明 |
|------|------|
| **R-016** | 禁止使用 `as any` 附加属性到 Fastify 实例，使用 `app.decorate()` |
| **R-017** | API 响应必须有明确的 TypeScript 类型，禁止 `Promise<any>` |
| **R-018** | 禁止空的 `catch {}` 块，至少 `console.warn()` 记录 |

### 1.5 优雅关闭

| 规则 | 说明 |
|------|------|
| **R-019** | 关闭处理必须包含: DB pool.end(), WebSocket close, NATS drain, 定时器清理 |
| **R-020** | 关闭必须有超时保护: `setTimeout(() => process.exit(1), 10000)` |

### 1.6 代码组织

| 规则 | 说明 |
|------|------|
| **R-021** | 每个功能模块使用独立的 Fastify plugin（通过 `app.register()` 装饰） |
| **R-022** | 配置解析必须带缓存，避免每次请求全表扫描 |

---

## 二、React 前端规范

### 2.1 性能

| 规则 | 说明 |
|------|------|
| **F-001** | 路由级页面必须使用 `React.lazy()` + `Suspense` 代码分割 |
| **F-002** | 图片/媒体 URL 创建后必须在组件卸载时调用 `URL.revokeObjectURL()` |
| **F-003** | 事件监听器必须在 useEffect cleanup 中移除 |
| **F-004** | 禁止在渲染内联对象/数组作为 hook 依赖项（会导致每次渲染重订阅） |

### 2.2 状态管理

| 规则 | 说明 |
|------|------|
| **F-005** | Zustand Store 超过 300 行时必须拆分为独立 slice |
| **F-006** | 每个 slice 有独立的状态/操作，通过 `create()` 的 slice 模式组合 |
| **F-007** | API 调用必须有 loading/error/data 三态处理 |

### 2.3 网络请求

| 规则 | 说明 |
|------|------|
| **F-008** | API 客户端必须使用泛型返回类型：`async function get<T>(url: string): Promise<T>` |
| **F-009** | 频繁请求的 GET 端点必须实现缓存（至少 `Map` 缓存 + 5 分钟 TTL） |
| **F-010** | 禁止 `window.location.href` 硬重定向，使用 React Router `navigate()` |
| **F-011** | 所有 WebSocket URL 中的 token 改为连接后首条消息发送 |

### 2.4 错误处理

| 规则 | 说明 |
|------|------|
| **F-012** | 禁止空 `catch {}`，至少 `console.warn()` |
| **F-013** | 403/404/409/422 错误码必须分别处理，不能统一归类为 UNKNOWN |
| **F-014** | 禁止在 catch 块中重抛不同错误但丢弃原始错误（应保留 `cause`） |

---

## 三、Kotlin/Android 规范

### 3.1 生命周期

| 规则 | 说明 |
|------|------|
| **A-001** | `@Singleton` 类创建的 `CoroutineScope` 必须提供 `destroy()` 方法调用 `scope.cancel()` |
| **A-002** | `WakeLock` 守护服务必须使用无超时 `acquire()` 或循环重新获取 |
| **A-003** | `EglBase` 实例必须存储在字段中，在 `shutdown()` 中调用 `eglBase.release()` |
| **A-004** | `PeerConnectionFactory.initialize()` 必须使用注入的 `ApplicationContext`，禁止 `Application()` 裸构造 |

### 3.2 资源管理

| 规则 | 说明 |
|------|------|
| **A-005** | 脚本引擎 `stop()` 必须能真正中断执行（设置 Rhino `Context` 中断标志） |
| **A-006** | 单例类禁止在 `init{}` 中进行重型初始化，使用懒加载或显式 `initialize()` |

### 3.3 混淆

| 规则 | 说明 |
|------|------|
| **A-007** | 禁止 `-repackageclasses` 除非已验证所有 Manifest 组件类名正确 |
| **A-008** | ProGuard keep 规则禁止使用 `{ *; }` 通配保留整个包 |

---

## 四、数据库规范

### 4.1 模式设计

| 规则 | 说明 |
|------|------|
| **D-001** | 每个表必须有 `created_at` 列 (默认 `now()`)，必要时加 `updated_at` |
| **D-002** | 所有外键列必须声明 `.references()` |
| **D-003** | 所有外键列必须有索引 |
| **D-004** | `created_at` / `started_at` / `finished_at` 等时间排序列必须有索引 |
| **D-005** | 禁止功能重复的表（如 accounts 和 platform_accounts 同时存在） |

### 4.2 迁移

| 规则 | 说明 |
|------|------|
| **D-006** | 迁移编号必须单调递增，禁止重复前缀 |
| **D-007** | 所有表必须通过 Drizzle ORM schema 定义（在 drizzle.config.ts 中注册） |

### 4.3 查询

| 规则 | 说明 |
|------|------|
| **D-008** | 数据的主存储必须是数据库，内存 Map/Set 仅可作为缓存层 |
| **D-009** | 启动时必须从 DB 加载持久化状态到内存缓存 |

---

## 五、通用规范 (全栈)

| 规则 | 说明 |
|------|------|
| **G-001** | 所有 `catch {}` 空块必须至少包含 `console.warn()` 或 `Log.w()` |
| **G-002** | 禁止在代码中使用 TODO 代替关键逻辑（如 Rhino stop） |
| **G-003** | 二进制资源 (EglBase, MediaSource, Bitmap) 必须在 finally/cleanup 中释放 |
| **G-004** | 禁止在生产代码中留下 `@ts-ignore` 或 `@Suppress("DEPRECATION")` |
