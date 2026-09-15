# ChatGPT ESA MCP Tunnel

Privately connect Alibaba Cloud ESA MCP to ChatGPT through OpenAI Secure MCP Tunnel, with Docker deployment and schema compatibility fixes.

> [!NOTE]
> This is an unofficial community project. It is not affiliated with or endorsed by OpenAI or Alibaba Cloud.

## Why this project?

Alibaba Cloud's official [`mcp-server-esa`](https://github.com/aliyun/mcp-server-esa) is a local **stdio MCP server**. ChatGPT cannot directly execute that local `npx` command on your server.

OpenAI's official [`tunnel-client`](https://github.com/openai/tunnel-client) solves that problem without exposing a public `/mcp` endpoint:

```text
ChatGPT
   │
   ▼
OpenAI Secure MCP Tunnel
   ▲
   │ outbound HTTPS
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

No public MCP endpoint, reverse proxy, inbound firewall rule, or self-hosted OAuth server is required.

## What is included?

- OpenAI `tunnel-client` runtime
- Alibaba Cloud `mcp-server-esa`
- Docker / Docker Compose deployment
- A small stdio compatibility wrapper for problematic ESA tool schemas
- Optional HTTP-to-SOCKS5 egress bridge for controlled network environments

## Why is there a compatibility wrapper?

At the time this project was created, `mcp-server-esa@1.1.0` exposed several tool schemas that strict MCP clients could reject. Examples included:

- invalid `type: "enum"` JSON Schema
- `required` placed inside `properties`
- MCP tool `annotations` nested inside `inputSchema`
- required parameters that were not actually exposed as input properties

`esa-stdio-compat.js` normalizes the `tools/list` response before it reaches ChatGPT.

It intentionally does **not** rewrite normal `tools/call` requests or responses.

Once these upstream schema issues are fixed, the compatibility layer should become a no-op and can eventually be removed.

## Supported ESA capabilities

The full `mcp-server-esa` binary exposes tools for areas including:

- Edge Routine
- Routine routes and deployments
- ESA Sites
- DNS records
- Certificates
- IPv6
- Managed Transform
- ESA Function & Pages

Actual API permissions still depend on the Alibaba Cloud AccessKey you provide.

## Requirements

- Docker Engine with Docker Compose v2
- Linux `amd64` host for the pinned Tunnel Client runtime used by the current Dockerfile
- An OpenAI Secure MCP Tunnel ID
- An OpenAI Runtime API key with the required Tunnel permissions
- Alibaba Cloud ESA AccessKey ID / Secret

## 1. Create an OpenAI Secure MCP Tunnel

Create a tunnel in your OpenAI Platform organization/workspace and keep the resulting ID:

```text
tunnel_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Create a **Runtime API key** for the long-running tunnel client. Follow the official OpenAI Tunnel Client documentation for the current permission requirements:

- <https://github.com/openai/tunnel-client>
- <https://github.com/openai/tunnel-client/blob/master/docs/permissions.md>

Do not use an OpenAI Admin key as the long-lived runtime key.

## 2. Clone and configure

```bash
git clone https://github.com/fx-k/chatgpt-esa-mcp-tunnel.git
cd chatgpt-esa-mcp-tunnel
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

```dotenv
CONTROL_PLANE_TUNNEL_ID=tunnel_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CONTROL_PLANE_API_KEY=sk-your-runtime-api-key

ALIBABA_CLOUD_ACCESS_KEY_ID=your-access-key-id
ALIBABA_CLOUD_ACCESS_KEY_SECRET=your-access-key-secret

MCP_COMMAND=mcp-server-esa-chatgpt
ESA_MCP_UPSTREAM=mcp-server-esa
```

Never commit `.env`.

## 3. Start

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Check logs:

```bash
docker compose logs -f esa
```

Typical successful startup contains messages similar to:

```text
stdio MCP command started
ESA MCP Server [esa-server] running on stdio
tunnel metadata fetched
```

When ChatGPT discovers tools, you may also see:

```text
[esa-compat] normalized tools/list: N compatibility fix(es)
```

`N > 0` means the compatibility wrapper repaired one or more upstream schemas.

## 4. Health checks

The Tunnel Client health server stays inside the container and is not published to the host.

```bash
docker compose exec esa curl -fsS http://127.0.0.1:8080/healthz
docker compose exec esa curl -fsS http://127.0.0.1:8080/readyz
```

A ready deployment should return HTTP 200.

## 5. Connect ChatGPT

In ChatGPT developer-mode app / connector settings:

1. Create or edit the app.
2. Choose **Tunnel** as the connection type.
3. Select the OpenAI Secure MCP Tunnel created earlier.
4. Refresh / discover operations.

You do **not** enter a public `/mcp` URL for this deployment.

## Optional: controlled SOCKS5 egress

The OpenAI Tunnel Client accepts HTTP/HTTPS proxies for its control-plane connection. It does not directly accept a `socks5://` URL as its control-plane proxy.

For enterprise networks or hosts where the intended outbound path is available through SOCKS5, this repository includes an optional GOST sidecar:

```text
tunnel-client
     │ HTTP CONNECT
     ▼
GOST
     │ SOCKS5
     ▼
controlled egress
     │
     ▼
OpenAI control plane
```

Add to `.env`:

```dotenv
SOCKS5_UPSTREAM=socks5://username:password@proxy.example.com:1080
```

Start with the optional override:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.proxy.yml \
  up -d --build
```

Only the Tunnel Client control-plane traffic is pointed at the internal HTTP proxy. `mcp-server-esa` can continue reaching Alibaba Cloud through the container's normal network path.

## `folder_deploy` note

The ESA `folder_deploy` tool expects a filesystem path visible **inside the MCP container**. A folder on your laptop or host is not automatically visible to the container.

If you want to use this tool, mount the deployment directory into the `esa` service and pass the in-container path.

## Security

- Never commit `.env`.
- Use a dedicated OpenAI Runtime API key, not an Admin key.
- Prefer a dedicated Alibaba Cloud identity / AccessKey with the minimum ESA permissions you need.
- Treat the Alibaba Cloud secret, OpenAI key, and proxy credentials as secrets.
- If a credential is ever published in Git history, rotate it; deleting the file later is not sufficient.
- No inbound network ports are required by the default Compose deployment.

## Project layout

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

## Versioning

The initial release intentionally pins known-working versions of the OpenAI Tunnel Client runtime and `mcp-server-esa`.

When upgrading either dependency, verify:

1. the Tunnel Client release artifact and checksum,
2. `tools/list` compatibility,
3. read-only ESA calls,
4. write operations you intend to enable.

## Upstream projects

- OpenAI Tunnel Client: <https://github.com/openai/tunnel-client>
- Alibaba Cloud ESA MCP Server: <https://github.com/aliyun/mcp-server-esa>
- GOST: <https://github.com/go-gost/gost>

## License

The original code in this repository is released under the MIT License. Third-party components retain their respective licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
