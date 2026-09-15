# Changelog

本项目遵循语义化版本思路记录重要变化。

## [0.1.0] - 2026-09-15

首个公开版本。

### 新增

- 基于 OpenAI 官方 Secure MCP Tunnel 私有接入 ChatGPT。
- Docker / Docker Compose 部署方案。
- 集成 `mcp-server-esa@1.1.0` 完整能力。
- 集成 OpenAI `tunnel-client` Runtime `v0.0.14`。
- 新增 `esa-stdio-compat.js` stdio 兼容层，用于规范化 `tools/list` 中的上游 Schema 问题。
- 支持修复非法 `type: "enum"`、错位的 `required`、错位的 MCP annotations，以及不存在于 properties 中的 required 字段。
- 提供可选 GOST HTTP → SOCKS5 出口桥接方案，仅用于需要受控出站路由的网络环境。
- 提供 `.env.example`，避免真实 OpenAI / Alibaba Cloud / Proxy 凭据进入仓库。
- 默认容器采用只读根文件系统、cap drop、no-new-privileges、内存与 PID 限制。
- 增加 GitHub Actions CI：校验 Node.js 语法、Compose 配置与 Docker 镜像构建。
- 增加中文架构说明 `docs/architecture.md`。
- 增加第三方许可证声明 `THIRD_PARTY_NOTICES.md`。

### 已验证

- OpenAI Secure MCP Tunnel Control Plane 可正常连接。
- ChatGPT 可发现完整 Alibaba Cloud ESA MCP Tool 集。
- `routine_list` 已完成真实 Alibaba Cloud ESA 读取调用验证。
- `mcp-server-esa@1.1.0` 的多处 Tool Schema 经兼容层规范化后可被 ChatGPT 接受。

### 已知限制

- 当前 Dockerfile 固定使用 Linux amd64 Tunnel Client Runtime。
- `folder_deploy` 只能读取 MCP 容器内可见的目录，宿主机目录需要额外挂载。
- 兼容层针对 `mcp-server-esa@1.1.0` 的已知 Schema 问题；升级上游版本后应重新验证并评估是否仍需该层。
- 写操作虽然已能被 ChatGPT 发现，但首版未对所有写操作逐项做端到端验证。
