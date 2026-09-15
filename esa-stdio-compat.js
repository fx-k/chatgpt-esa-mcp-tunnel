#!/usr/bin/env node

"use strict";

const { spawn } = require("child_process");
const readline = require("readline");

const upstream = process.env.ESA_MCP_UPSTREAM || "mcp-server-esa";

const MCP_ANNOTATION_KEYS = [
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksLikeMcpAnnotations(value) {
  return (
    isObject(value) &&
    MCP_ANNOTATION_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    )
  );
}

function mergeAnnotations(tool, annotations) {
  if (!looksLikeMcpAnnotations(annotations)) return 0;

  tool.annotations = {
    ...(isObject(tool.annotations) ? tool.annotations : {}),
    ...annotations,
  };

  return 1;
}

function normalizeSchema(schema, tool, root = false) {
  if (!isObject(schema)) return 0;

  let fixes = 0;

  // JSON Schema 不存在 type: "enum"。
  // ESA 1.1.0 的部分 Route Tool 实际想表达的是 string + enum。
  if (schema.type === "enum") {
    schema.type = "string";
    fixes++;
  }

  // MCP Tool annotations 应位于 Tool 对象，而不是 inputSchema 内部。
  if (looksLikeMcpAnnotations(schema.annotations)) {
    fixes += mergeAnnotations(tool, schema.annotations);
    delete schema.annotations;
  } else if (
    isObject(schema.annotations) &&
    Object.keys(schema.annotations).length === 0
  ) {
    // 空 annotations 虽然通常不会导致 JSON Schema 非法，
    // 但没有实际意义，顺手清理掉可以让返回结构更干净。
    delete schema.annotations;
    fixes++;
  }

  const properties = isObject(schema.properties) ? schema.properties : null;

  if (properties) {
    // 部分 ESA Tool 把 required / annotations 错误塞进 properties。
    if (Array.isArray(properties.required)) {
      schema.required = Array.from(
        new Set([
          ...(Array.isArray(schema.required) ? schema.required : []),
          ...properties.required,
        ])
      );
      delete properties.required;
      fixes++;
    }

    if (looksLikeMcpAnnotations(properties.annotations)) {
      fixes += mergeAnnotations(tool, properties.annotations);
      delete properties.annotations;
    } else if (
      isObject(properties.annotations) &&
      Object.keys(properties.annotations).length === 0
    ) {
      delete properties.annotations;
      fixes++;
    }

    for (const value of Object.values(properties)) {
      fixes += normalizeSchema(value, tool, false);
    }

    // 在根 inputSchema 中，移除那些 required 中存在、
    // 但根本没有暴露在 properties 中的字段。
    // ESA 的 DNS Create Tool 会在 handler 内部自行设置 record type。
    if (root && Array.isArray(schema.required)) {
      const cleaned = schema.required.filter((name) =>
        Object.prototype.hasOwnProperty.call(properties, name)
      );

      if (
        cleaned.length !== schema.required.length ||
        cleaned.some((value, index) => value !== schema.required[index])
      ) {
        schema.required = cleaned;
        fixes++;
      }
    }
  }

  const singleSchemaKeys = [
    "items",
    "contains",
    "additionalProperties",
    "unevaluatedProperties",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
  ];

  for (const key of singleSchemaKeys) {
    if (isObject(schema[key])) {
      fixes += normalizeSchema(schema[key], tool, false);
    }
  }

  const arraySchemaKeys = ["allOf", "anyOf", "oneOf", "prefixItems"];

  for (const key of arraySchemaKeys) {
    if (Array.isArray(schema[key])) {
      for (const child of schema[key]) {
        fixes += normalizeSchema(child, tool, false);
      }
    }
  }

  const mapSchemaKeys = [
    "$defs",
    "definitions",
    "patternProperties",
    "dependentSchemas",
  ];

  for (const key of mapSchemaKeys) {
    if (isObject(schema[key])) {
      for (const child of Object.values(schema[key])) {
        fixes += normalizeSchema(child, tool, false);
      }
    }
  }

  return fixes;
}

function normalizeTool(tool) {
  if (!isObject(tool)) return 0;

  let fixes = 0;

  if (isObject(tool.inputSchema)) {
    fixes += normalizeSchema(tool.inputSchema, tool, true);
  }

  if (isObject(tool.outputSchema)) {
    fixes += normalizeSchema(tool.outputSchema, tool, true);
  }

  return fixes;
}

function rewriteMessage(message) {
  if (Array.isArray(message)) {
    let fixes = 0;
    for (const item of message) {
      fixes += rewriteMessage(item);
    }
    return fixes;
  }

  if (!isObject(message)) return 0;

  const tools = message?.result?.tools;

  if (!Array.isArray(tools)) {
    return 0;
  }

  let fixes = 0;

  for (const tool of tools) {
    fixes += normalizeTool(tool);
  }

  return fixes;
}

const child = spawn(upstream, [], {
  env: process.env,
  stdio: ["pipe", "pipe", "inherit"],
});

child.on("error", (err) => {
  console.error(`[esa-compat] 无法启动上游 ${upstream}:`, err);
  process.exit(1);
});

// ChatGPT / tunnel-client → compat wrapper → ESA MCP
process.stdin.pipe(child.stdin);

// ESA MCP → compat wrapper → ChatGPT / tunnel-client
const rl = readline.createInterface({
  input: child.stdout,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) {
    process.stdout.write("\n");
    return;
  }

  try {
    const message = JSON.parse(line);
    const fixes = rewriteMessage(message);

    if (fixes > 0) {
      console.error(
        `[esa-compat] normalized tools/list: ${fixes} compatibility fix(es)`
      );
    }

    process.stdout.write(JSON.stringify(message) + "\n");
  } catch {
    // 不吞掉任何无法解析的上游输出。
    process.stdout.write(line + "\n");
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[esa-compat] 上游进程因 ${signal} 退出`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}
