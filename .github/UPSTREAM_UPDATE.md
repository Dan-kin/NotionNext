# 上游更新流程

本站不自动将 NotionNext 上游提交合入 `main`。上游更新需人工审查，避免依赖或页面行为的变化未经验证就进入线上。

1. 从当前 `main` 新建分支，获取 `notionnext-org/NotionNext` 的 `main`，在该分支合并上游。
2. 逐项解决冲突，保留本站的配置和定制；检查依赖、构建配置、GitHub Actions 与部署配置的变化。
3. 使用更新后的锁文件安装依赖，运行相关测试和构建，并检查预览站点的关键页面。
4. 提交 Pull Request，确认改动和预览结果后再合入 `main`。合并前保留当前生产版本作为回滚点。

`lib/db/notion/getNotionAPI.js` 曾因本站的 Notion 请求标识与上游同一段代码发生冲突。处理这段代码时，应验证本站的 Notion 页面仍能正常加载。
