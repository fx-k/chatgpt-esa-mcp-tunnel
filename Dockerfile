FROM node:22-alpine

ARG TUNNEL_VERSION=v0.0.14
ARG TUNNEL_SHA256=29d29cf860ada54e4d3c82c715f4fbfcff2abcdc2584c0fc26431308dfa2505b
ARG ESA_MCP_VERSION=1.1.0

RUN apk add --no-cache \
      ca-certificates \
      curl \
      unzip \
      tini \
    && curl -fL \
      "https://github.com/openai/tunnel-client/releases/download/${TUNNEL_VERSION}/tunnel-client-runtime-${TUNNEL_VERSION}-linux-amd64.zip" \
      -o /tmp/tunnel-client.zip \
    && echo "${TUNNEL_SHA256}  /tmp/tunnel-client.zip" | sha256sum -c - \
    && mkdir -p /tmp/tunnel-client \
    && unzip /tmp/tunnel-client.zip -d /tmp/tunnel-client \
    && find /tmp/tunnel-client -type f -name 'tunnel-client-runtime' \
         -exec install -m 0755 {} /usr/local/bin/tunnel-client-runtime \; \
    && test -x /usr/local/bin/tunnel-client-runtime \
    && rm -rf /tmp/tunnel-client /tmp/tunnel-client.zip

RUN npm install -g \
      --omit=dev \
      --no-audit \
      --no-fund \
      "mcp-server-esa@${ESA_MCP_VERSION}" \
    && npm cache clean --force

COPY --chmod=0555 esa-stdio-compat.js /usr/local/bin/mcp-server-esa-chatgpt

USER node

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/tunnel-client-runtime", "run"]
