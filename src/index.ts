#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── AppleScript executor ─────────────────────────────────────────────────────
// SECURITY: Only this function may call osascript. All scripts are hardcoded
// literals defined in this file. No user-supplied script content is ever
// passed to osascript. do shell script is never used.

async function runAppleScript(script: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], {
    timeout: 15_000,
  });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "finder-mcp-server",
  version: "1.0.1",
});

// ─── Tools ────────────────────────────────────────────────────────────────────

// (no tools — rebuild from requirements)

// ─── Transport ────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
