import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipaiClient, defaultBaseUrl } from "./client.js";
import { INSTRUCTIONS, LOCKED_INSTRUCTIONS, registerTools } from "./tools.js";

export { ClipaiClient, NOT_RUNNING } from "./client.js";
export { INSTRUCTIONS } from "./tools.js";

/** `project` locks the server to one project (the in-app chat sets CLIPAI_PROJECT). */
export function createMcpServer(baseUrl = defaultBaseUrl(), project = process.env.CLIPAI_PROJECT || undefined) {
  const server = new McpServer({ name: "clipai", version: "0.1.0" }, { instructions: project ? LOCKED_INSTRUCTIONS : INSTRUCTIONS });
  registerTools(server, new ClipaiClient(baseUrl), project);
  return server;
}
