# ChatGPT ESA MCP Tunnel

通过 OpenAI 官方 Secure MCP Tunnel，将 Alibaba Cloud ESA MCP 私有接入 ChatGPT，并提供 Docker 部署与 `mcp-server-esa` Schema 兼容修复。

> [!NOTE]
> 这是一个非官方社区项目，与 OpenAI、Alibaba Cloud 均无隶属关系，也不代表其官方立场。

## 为什么需要这个项目？

Alibaba Cloud 官方的 [`mcp-server-esa`](https://github.com/aliyun/mcp-server-esa) 是一个本地 **stdio MCP Server**。ChatGPT Web 无法直接在你的服务器上执行本地 `npx` 命令，因此需要一个安全的远程桥接方式。

OpenAI 官方的 [`tunnel-client`](https://github.com/openai/tunnel-client) 可以在**不暴露公网 `/mcp` 地址**的情况下，把 ChatGPT 的 MCP 调用送到你的私有服务器：

```text
ChatGPT
   │
   ▼
OpenAI Secure MCP Tunnel
   ▲
   │ 主动出站 HTTPS
   │
tunnel-client
   │ stdio
   ▼
esa-stdio-compat.js
   │ stdio
   ▼
mcp-server-esa
   │
   ▼
Alibaba Cloud ESA API
```

默认方案不需要：

- 公网 MCP 域名
- Nginx / Caddy 反向代理
- 自建 OAuth Server
- 对外开放入站端口
- Cloudflare Tunnel

服务器只需要主动连接 OpenAI 和 Alibaba Cloud 即可。

## 项目包含什么？

- OpenAI `tunnel-client` Runtime
- Alibaba Cloud `mcp-server-esa`
- Docker / Docker Compose 部署
- 一个轻量的 stdio Schema 兼容层
- 可选的 HTTP → SOCKS5 出口桥接方案

## 为什么需要 `esa-stdio-compat.js`？

在本项目创建时，`mcp-server-esa@1.1.0` 中存在若干会被严格 MCP Client 拒绝的 Tool Schema，例如：

- 非法 JSON Schema：`type: "enum"`
- `required` 被错误放入 `properties`
- MCP Tool `annotations` 被错误放入 `inputSchema`
- `required` 引用了并未暴露给 Client 的字段

`esa-stdio-compat.js` 会在 `tools/list` 返回给 ChatGPT 前，对这些 Schema 做最小规范化处理。

它**不会改写正常的 `tools/call` 请求与响应**，也不会改变 Alibaba Cloud ESA API 的业务行为。

如果未来上游已经修复这些问题，该兼容层将基本变成 no-op，并可进一步移除。

## 支持的 ESA 能力

完整版 `mcp-server-esa` 当前包含的能力包括但不限于：

- Edge Routine
- Routine Route / Deployment
- ESA Site
- DNS Records
- Certificate
- IPv6
- Managed Transform
- ESA Function & Pages

实际可调用权限仍取决于你为 Alibaba Cloud AccessKey 配置的 RAM 权限。

## 环境要求

- Docker Engine
- Docker Compose v2
- Linux `amd64` 主机（当前 Dockerfile 固定使用 OpenAI Tunnel Client 的 Linux amd64 Runtime）
- 一个 OpenAI Secure MCP Tunnel ID
- 一个可供 Tunnel Runtime 使用的 OpenAI Runtime API Key
- Alibaba Cloud ESA AccessKey ID / AccessKey Secret

## 1. 创建 OpenAI Secure MCP Tunnel

在 OpenAI Platform 中创建 Tunnel，并保存生成的 Tunnel ID：

```text
tunnel_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

同时创建用于长期运行 `tunnel-client` 的 **Runtime API Key**。

请以 OpenAI 官方文档为准确认当前 Tunnel 权限要求：

- <https://github.com/openai/tunnel-client>
- <https://github.com/openai/tunnel-client/blob/master/docs/permissions.md>

长期运行的 Tunnel Client 不应使用 OpenAI Admin Key。

## 2. 克隆并配置

```bash
git clone https://github.com/fx-k/chatgpt-esa-mcp-tunnel.git
cd chatgpt-esa-mcp-tunnel
cp .env.example .env
chmod 600 .env
```

编辑 `.env`：

```dotenv
CONTROL_PLANE_TUNNEL_ID=tunnel_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CONTROL_PLANE_API_KEY=sk-your-runtime-api-key

ALIBABA_CLOUD_ACCESS_KEY_ID=your-access-key-id
ALIBABA_CLOUD_ACCESS_KEY_SECRET=your-access-key-secret

MCP_COMMAND=mcp-server-esa-chatgpt
ESA_MCP_UPSTREAM=mcp-server-esa
```

**不要提交 `.env`。**

## 3. 启动

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f esa
```

正常启动时通常会看到类似：

```text
stdio MCP command started
ESA MCP Server [esa-server] running on stdio
tunnel metadata fetched
```

当 ChatGPT 重新发现 Tools 时，可能还会看到：

```text
[esa-compat] normalized tools/list: N compatibility fix(es)
```

其中 `N > 0` 表示兼容层实际修复了一个或多个上游 Schema 问题。

## 4. 健康检查

Tunnel Client 的健康检查端口只存在于容器内部，默认不会映射到宿主机：

```bash
docker compose exec esa curl -fsS http://127.0.0.1:8080/healthz
docker compose exec esa curl -fsS http://127.0.0.1:8080/readyz
```

正常情况下应返回 HTTP 200。

## 5. 在 ChatGPT 中连接

在 ChatGPT Developer Mode 的 App / Connector 配置中：

1. 创建或编辑 App。
2. Connection 类型选择 **Tunnel**。
3. 选择刚才创建的 OpenAI Secure MCP Tunnel。
4. 刷新 / Discover operations。

这里**不需要填写公网 `/mcp` URL**。

## 可选：通过 SOCKS5 修正受控网络出口

OpenAI Tunnel Client 的 Control Plane Proxy 接受 HTTP / HTTPS Proxy，但不直接接受 `socks5://` URL。

如果你的服务器处在企业网络、复杂出口网络或其他需要通过 SOCKS5 才能走到正确出口的环境，本项目提供一个可选的 GOST Sidecar：

```text
tunnel-client
     │ HTTP CONNECT
     ▼
GOST
     │ SOCKS5
     ▼
指定出口
     │
     ▼
OpenAI Control Plane
```

在 `.env` 中增加：

```dotenv
SOCKS5_UPSTREAM=socks5://username:password@proxy.example.com:1080
```

使用额外 Compose 文件启动：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.proxy.yml \
  up -d --build
```

这个模式只会把 **OpenAI Tunnel Control Plane** 流量指向内部 HTTP Proxy；`mcp-server-esa` 访问 Alibaba Cloud API 仍可走容器默认网络路径。

## `folder_deploy` 的路径问题

ESA 的 `folder_deploy` Tool 要求传入一个 **MCP 容器内部可见的目录路径**。

也就是说，你电脑或宿主机上的目录不会自动出现在容器里。

如果需要使用这个 Tool，请自行把目标目录挂载到 `esa` 服务中，例如：

```yaml
services:
  esa:
    volumes:
      - ./site:/workspace/site:ro
```

随后将 `/workspace/site` 作为 Tool 参数传入。

## 安全建议

- 永远不要提交 `.env`。
- OpenAI Tunnel Runtime 使用专门的 Runtime API Key，不要使用 Admin Key。
- Alibaba Cloud 建议使用专门的 RAM 用户 / AccessKey，并按需授予最小 ESA 权限。
- OpenAI Key、Alibaba Cloud AccessKey Secret、代理凭据都应视为敏感信息。
- 如果密钥曾经进入公开 Git 历史，仅删除文件并不够，应立即轮换密钥。
- 默认部署不需要任何公网入站端口。

## 项目结构

```text
.
├── Dockerfile
├── docker-compose.yml
├── docker-compose.proxy.yml
├── esa-stdio-compat.js
├── .env.example
├── .gitignore
├── .dockerignore
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

## 版本策略

当前首版会固定一组已经实际验证过的 OpenAI Tunnel Client 与 `mcp-server-esa` 版本。

升级依赖时建议至少重新验证：

1. Tunnel Client Release Artifact 与 SHA256
2. `tools/list` 是否仍兼容 ChatGPT
3. ESA 只读调用
4. 你实际需要的写操作

如果上游 `mcp-server-esa` 已修复 Schema 问题，也可以评估移除兼容层。

## 上游项目

- OpenAI Tunnel Client：<https://github.com/openai/tunnel-client>
- Alibaba Cloud ESA MCP Server：<https://github.com/aliyun/mcp-server-esa>
- GOST：<https://github.com/go-gost/gost>

## License

本仓库原创代码使用 MIT License。

第三方组件继续遵循各自的 License，详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
