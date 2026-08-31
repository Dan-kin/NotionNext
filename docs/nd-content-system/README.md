# Nouveau Départ 内容候选系统 V1

## 目标

为在法国生活、学习和工作的中文艺术从业者与文化项目参与者，持续发现并筛选法国文化活动、艺术机会和中法合作路径。

V1 只生成候选报告，不修改 Notion，不自动发布，也不保存来源全文或图片。现有 Notion 数据库仍是网站内容的唯一发布源；`Published` 仍由人工确认。

## 工作流

```text
来源白名单
  -> 只读抓取公开元数据
  -> URL/主题去重
  -> 栏目分类与确定性评分
  -> GitHub Actions 候选报告
  -> 人工 REVIEW + 主办方官网核验
  -> 人工建立 Notion Draft
  -> Dan 最终确认 Published
```

## 四个栏目

- **本周去看**：巴黎及法兰西岛值得去看的展览、演出、文化活动。
- **机会雷达**：驻留、征集、资助、奖项、培训和专业流动机会。
- **中法连接**：中法机构合作、艺术家交流、双向传播和可参与项目。
- **艺术路径**：在法国学习、工作、建立职业身份所需的实用解释。

栏目是编辑入口，不要求修改现有 Notion `category` 结构。V1 报告中先保留栏目建议，人工建稿时再映射到当前分类和标签。

## 本地使用

```bash
yarn nd:content:test
yarn nd:content:collect
```

默认输出到 `.nd-content-reports/`：

- `candidates.json`：可审计的结构化候选数据。
- `candidates.md`：给编辑人员阅读的 REVIEW 清单。

可限制一次试运行的来源和条目数：

```bash
yarn nd:content:collect --source offi_exhibitions --limit-per-source 3
```

## 自动运行

`.github/workflows/nd-content-candidates.yml` 有三种运行方式：

- 合并前测试：相关代码或来源配置的 Pull Request 会运行一轮真实采集，每个来源最多读取 2 个详情页，用于验证采集器。
- 正式周更：合并到 `main` 后，启用绑定当前私密 Codex 任务的每周自动化；每个来源默认最多读取 10 个详情页。
- 手工复查：可在 Actions 中指定单一来源和读取上限后手工触发技术检查。

GitHub 仓库是公开的，因此 Actions 只显示来源数、发现数、候选数和错误数，不显示或上传候选标题、URL、报告及审核决定。完整报告只在私密 Codex 任务中展示，不创建文章、不改数据库。Pull Request 测试通过不等于自动批准内容；候选仍须按 REVIEW 清单人工确认。

## 私密批准指令

每周候选在当前 Codex 任务中以 URL 哈希生成的稳定编号（如 `C-A1B2C3`）展示。Dan 可直接回复：

- `批准 C-A1B2C3 C-D4E5F6`：允许进入下一步人工建 Notion `Draft`，但不代表公开发布。
- `退回 C-A1B2C3：原因`：本轮排除并记录理由。
- `全部暂缓`：本轮不建稿。
- `批准发布 C-A1B2C3`：仅在已检查 Notion Draft 后，才允许另行执行 `Published` 变更。

任何未明确编号的“可以”“看起来不错”都不视为批准。GitHub PR approval 只批准代码合并，不批准候选内容。

## 数据边界

- 收集：标题、摘要性元数据、公开日期、地点、原始 URL、来源和评分理由。
- 不收集：正文副本、图片副本、个人信息、付费墙内容。
- 聚合站或专业媒体只用于发现；日期、地点、资格、费用和截止时间需回到主办方页面确认。
- 如果来源阻止自动访问，系统记录错误并跳过，不绕过访问限制。

详细规则见 [SOURCE-WHITELIST.md](./SOURCE-WHITELIST.md)、[EDITORIAL-RULES.md](./EDITORIAL-RULES.md) 和 [REVIEW-CHECKLIST.md](./REVIEW-CHECKLIST.md)。
