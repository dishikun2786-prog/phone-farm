# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-05-15

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** phone
- **Description:** 通过 Web 仪表盘可视化控制多台分布在不同网络的 Android 手机，自动执行微信视频号、抖音、快手、小红书的营销任务（浏览、点赞、评论、关注、私信等）。

## Do-Not-Repeat

- [2026-05-16] 添加新角色时必须同步更新三处：后端 Zod schema、前端 ROLE_LABELS+ROLE_COLORS、前端角色下拉框。遗漏任何一处都会导致创建失败或显示异常。
- [2026-05-16] Admin 路由必须同时添加 requireAuth 和 requirePermission 双重守卫，仅 requireAuth 不足。添加 requirePermission 时需更新函数签名传入 authService。

## Decision Log

- [2026-05-16] adminCreditRoutes 签名改为 `(app, authService)` 以注入 requirePermission，与其他 admin 路由保持一致。
- [2026-05-16] 用户管理角色扩展至全部 7 种 (含 customer/agent)，登录无角色限制 — 所有角色均可通过手机 APP 账号密码登录。
