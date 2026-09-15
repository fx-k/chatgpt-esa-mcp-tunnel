# 第三方组件声明

本项目在构建或可选部署过程中会使用以下第三方软件。它们继续遵循各自的开源许可证。

## OpenAI Tunnel Client

- 项目：<https://github.com/openai/tunnel-client>
- License：Apache License 2.0
- 用途：建立 OpenAI Secure MCP Tunnel 的 Runtime 连接

本项目的 Dockerfile 会在构建阶段下载官方发布的 `tunnel-client-runtime` 二进制，并校验固定 SHA256。

## Alibaba Cloud MCP Server ESA

- 项目：<https://github.com/aliyun/mcp-server-esa>
- License：MIT License
- 用途：提供 Alibaba Cloud ESA 的 MCP Tools

本项目通过 npm 安装固定版本的 `mcp-server-esa`，并未复制其源码。

## GOST

- 项目：<https://github.com/go-gost/gost>
- License：MIT License
- 用途：仅在 `docker-compose.proxy.yml` 中作为可选的 HTTP → SOCKS5 出口桥接 Sidecar

默认部署不会启动 GOST。

## 说明

本仓库中的原创代码（例如 `esa-stdio-compat.js`、Docker / Compose 配置和文档）使用仓库根目录中的 MIT License。

如本声明与第三方项目自身 License 存在不一致，请以第三方项目原始 License 文本为准。
