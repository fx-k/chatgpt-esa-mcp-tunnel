# 架构说明

## 默认链路

```text
ChatGPT
   │
   ▼
OpenAI Secure MCP Tunnel
   ▲
   │ HTTPS 长轮询 / Response
   │
tunnel-client-runtime
   │ stdio
   ▼
esa-stdio-compat.js
   │ stdio
   ▼
mcp-server-esa
   │ HTTPS + Alibaba Cloud AK/SK
   ▼
Alibaba Cloud ESA API
```

核心特点：

- MCP Server 不需要公网入口。
- 服务器主动连接 OpenAI Control Plane。
- ChatGPT 不直接访问服务器 IP 或端口。
- `mcp-server-esa` 继续使用原生 stdio MCP 协议。
- Compatibility Wrapper 只规范化 `tools/list` 中的 Tool Schema。

## 为什么不用普通 Remote MCP？

普通 Remote MCP 的典型链路是：

```text
ChatGPT
   │ HTTPS
   ▼
公网 /mcp Endpoint
   │
   ▼
HTTP ↔ stdio Proxy
   │
   ▼
mcp-server-esa
```

这种方式通常还需要额外考虑：

- 公网域名
- HTTPS
- MCP Endpoint 的认证
- OAuth / Token
- 入站网络安全

OpenAI Secure MCP Tunnel 则把连接方向反过来，由私有服务器主动连接 OpenAI，更适合“自己的 MCP 只给 ChatGPT / Codex 使用”的场景。

## Compatibility Wrapper 做什么？

`esa-stdio-compat.js` 位于 Tunnel Client 与官方 ESA MCP Server 之间：

```text
tunnel-client
     │
     ▼
compat wrapper
     │
     ▼
mcp-server-esa
```

它会读取上游 stdout 的 JSON-RPC 消息。

只有当消息包含 `result.tools`（即 `tools/list` 响应）时，才对 Tool Schema 做规范化，包括：

1. `type: "enum"` → `type: "string"`
2. 将错误放入 `inputSchema` 的 MCP annotations 移至 Tool 顶层
3. 将错误放入 `properties` 的 `required` 恢复到 Schema 顶层
4. 删除 `required` 中并未出现在根 `properties` 的字段
5. 清理无意义的空 `annotations: {}`

普通 Tool Call 不会被业务级改写：

```text
tools/call
   ↓
compat wrapper
   ↓ 原样转发
mcp-server-esa
```

## 可选出口代理

某些受控网络环境中，OpenAI Control Plane 需要通过指定 SOCKS5 出口访问。

Tunnel Client 的 Control Plane Proxy 接受 HTTP / HTTPS Proxy，因此可使用 GOST 做协议桥接：

```text
tunnel-client
     │ CONTROL_PLANE_HTTP_PROXY
     ▼
GOST HTTP Proxy
     │
     ▼
SOCKS5 upstream
     │
     ▼
OpenAI Control Plane
```

这个代理只用于 OpenAI Control Plane 流量。

Alibaba Cloud ESA API 仍可走容器默认网络：

```text
mcp-server-esa
     │
     └──────────────► Alibaba Cloud ESA API
```

因此不会因为启用 Tunnel 出口代理而强制让所有 ESA API 请求经过同一个代理。

## 安全边界

默认 Compose：

- 不发布任何宿主机端口
- 根文件系统只读
- Drop ALL Linux capabilities
- `no-new-privileges`
- 非 root Node 用户运行
- Tunnel Runtime Key / Alibaba Cloud Secret 只从 `.env` 注入

`.env` 已被 `.gitignore` 与 `.dockerignore` 排除。
