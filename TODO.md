# Wuu-Tavern 安全升级 TODO

> Base snapshot: `71b9c087d10446f1603d356dc3210d9d3805550b` (main, 2026-09-24).
> Immutable reference branch: `backup/2026-09-24-before-feature-upgrade`.
> Development branch: `feature/safe-upgrade-phase1`.
> **Safety rule:** develop and test only on feature branches. Never rewrite `main` or the backup branch. Merge only after manual UI/data regression verification.

| 优先级 | 事项 | 状态 | 验收条件 |
| --- | --- | --- | --- |
| P0 | 备份升级前完整仓库并隔离开发分支 | ✅ Done | 两条分支均从同一基准 SHA 创建；main 不变 |
| P0 | 修正存储初始化安全性 | ✅ Implemented (browser QA pending) | 不强行将 pending/uncertain 标记为 ok；持久化申请失败不虚报成功 |
| P0 | 状态中心历史版本、回滚及移动端 UI | ✅ Implemented (browser QA pending) | 每次变更记录旧版本；手动确认后恢复；重启及导出仍保留 |
| P0 | 分支设计：聊天 + 状态 + 摘要 + 作者注释快照 | 🧪 Implemented (browser QA pending) | 切换分支时所有相关状态同步，不混写世界书；保持旧导入兼容 |
| P0 | 分支数据隔离与撤销/重做 | 🧪 非破坏式父/子剧情线 back/forward 已实现；浏览器 QA 待做 | 导航不删除任一剧情线；导航记录保存失败时拒绝切换 |
| P1 | 长期记忆与原消息关联 | 🧪 手动固定 + 可选自动长期记忆已实现；浏览器 QA 待做 | 自动记忆每轮最多2条、来源校验、编辑/删除/剧情回滚后自动失效 |
| P1 | Swipes 候选回复与状态同步 | 🧪 新回复状态快照/安全切换已实现；浏览器测试待做 | 老回复缺快照提示，已有后续剧情需先创建分支 |
| P1 | Prompt 组成与状态注入调试 | 🧪 已实现来源、角色 token 估算、激活世界书、状态预算诊断 | token 为本地估算；最终精确计费仍以 API usage 为准 |
| P1 | Chat Completion Source / Reasoning Adapter | 🧪 Implemented (browser QA pending) | Auto/OpenAI/OpenRouter/DeepSeek/Generic 分流；显示、保存、历史回传互相独立；历史回传默认关闭 |\n| P1 | Quick Reply 可折叠快捷菜单 | 🧪 Implemented (browser QA pending) | 不挡输入框，不影响现有群聊 @ |
| P2 | 角色语音/表情/沉浸模式 | ⬜ Planned | 默认关闭，低性能设备可禁用 |
| P2 | 群聊角色互动优化 | ⬜ Planned | 不破坏原有指定发言和角色提示词 |
| P3 | 扩展接口/模块化拆分 | ⬜ Planned | 新模块按需启用，无高频全页 MutationObserver |

## 每阶段必跑回归

1. 旧对话读取、切换、保存和刷新后恢复；逐项确认数据没有丢失。
2. 普通聊天/群聊、流式输出/中止、重生成与继续生成。
3. 状态中心解析隐藏标签；生成前仅注入当前对话状态；不能出现跨对话污染。
4. 手动导出单对话与全量备份；测试旧备份重新导入。
5. 手机/桌面模态框、角色卡/世界书/作者注释功能及输入框点击。
6. 浏览器未授予持久化、存储失败/配额耗尽时保持警告并能导出数据。

## 状态中心版本安全原则

- 初始版本没有历史时，不伪造历史记录。
- 自动更新和人工回滚都必须先保存旧值；历史与对话一起持久化。
- 恢复仅作用于当前对话和选中的单张表，不能碰角色卡或世界书。
- 保留有上限的历史条目，以免长对话无限扩张。

## 第一批开发记录（仅功能分支，尚未合并）

- `ot-boot.js`：不再强制更改 `StorageService._savesArmed` / `_loadStatus`，也不强制隐藏存储告警。
- `index.html`：状态表更新前保存旧版本，每个对话最多 80 条历史、每张表最多 8 条；回滚禁止在生成过程中操作并要求成功持久化后才报告成功。
- `ot-status.js`：状态历史浏览/预览/恢复、移动端纵向布局；保留原状态中心入口，不新增悬浮按钮。
- `tests/status-center.test.cjs` + `.github/workflows/ci.yml`：基础自动化回归和 JS 语法检查。

**尚未验证：** 完整的桌面/手机浏览器端到端 UI、真实 OPFS/浏览器恢复失败场景、实际备份导入。通过这些检查之前不要合并到 main。

## Additional P0 features

- [x] Chat-image embeds for both message roles (upload or HTTPS link), click-to-preview, and current-chat image gallery reuse; failed saves roll back safely; browser QA pending.
- [x] Split character and user status cards; per-character switcher for group conversations; browser QA pending.
- [x] New timeline snapshots and branch creation from snapshotted turns; browser QA pending.
- [x] Non-destructive branch back/forward navigation; parent and child timelines are both preserved.\n- [ ] Historical shared-world-book restore and deeper legacy swipe-specific state restore.
- [x] Opt-in source-linked automatic long-term memory (max 2 candidates/turn, stale-source invalidation); browser QA pending.\n- [x] Prompt diagnostics: completion source, role token estimates, activated WorldBook entries and Status Center budget; provider billing tokens still rely on API usage.\n- [ ] Optional immersion UI and extension architecture.

All feature work remains isolated on the development branch until browser and export/import verification.

- Quick Reply 初版：保存至单独对话，在输入框现有 + 菜单内打开管理器；仅文本快捷语，不自动发送、不执行脚本，单对话最多 20 条。

## 2026-09-24：故障修复与续开发记录

- 修复 GitHub Actions 连续失败：原测试错误地统计了协议说明里的示例 `<StatusTable>`，而不只是实际 `CURRENT_STATUS_CENTER` 数据块。修正测试边界后回归测试通过。
- 优化 CI：同一个功能分支不再同时触发 push 与 PR 两份检查；快速连续提交取消过期运行；文档变更不跑代码检查；Node 24 和 `ot-*.js` 全模块语法检查。
- 懒加载状态中心会在真正创建时发送事件，保证「重要记忆」和「上下文」标签能够显示。
- 已加入来源消息关联的手动固定记忆；被编辑/删除或更改剧情的来源会失效，并阻止继续注入模型；记忆随对话分支快照复制。
- 状态中心新增状态表优先级注入诊断；主场景、玩家和当前发言角色优先；只在完整 XML 标签内截断正文，避免损坏传输格式。
- 新生成的 Swipes 保留独立的状态中心快照，切换时同步恢复；缺少可信快照的旧记录会提示风险；有后续用户剧情的历史回复改用非破坏性分支。
- 独立图片引用图库已手工移植到当前功能分支（原 PR #4 因基线前进产生冲突而不强合）；支持当前对话图片复用、跨对话隔离、12张上限和保存失败回滚。

**持续红线：** 不直接修改 `main` 或只读原版备份；不合并尚未经移动端/桌面端及 OPFS 导入导出验证的代码。当前仅自动化回归通过，不代表全功能人工验收。


## 2026-09-24：Reasoning / Memory / Media 扩展

- 新增聊天补全来源：Auto / OpenAI / OpenRouter / DeepSeek / Generic；按来源生成兼容的 reasoning 请求字段，避免互相串字段。
- 推理显示与历史回传分离；历史推理默认不回传。DeepSeek 可按协议回传 reasoning_content；OpenRouter 只回传确认完整保存的 reasoning_details，不伪造签名推理。
- Prompt Debug 增加本地 token 估算、system/user/assistant 分布、激活世界书及其估算 token、状态中心截断/省略信息。
- 自动长期记忆为每对话独立开关；沿用隐藏状态传输块，每轮最多2条，绑定来源消息并在来源失效时停止注入。
- 图片引用支持输入 `#` 打开本对话图库并复用已有图片；不会自动把 display-only 图片作为视觉输入再次发给模型。
- 本批自动化回归已通过；仍需桌面/移动端真实浏览器、OPFS、导出导入与实际 Provider API 联调后再考虑合并 main。

- 剧情分支新增非破坏式 `↶/↷` 导航；返回父线时记录最近子线，重做直接回到该子线，不通过删除实现撤销。\n