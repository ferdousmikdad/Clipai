import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ClipaiClient, defaultBaseUrl } from "./client.js";
import { INSTRUCTIONS, registerTools } from "./tools.js";

export { ClipaiClient, NOT_RUNNING } from "./client.js";
export { INSTRUCTIONS } from "./tools.js";

export function createMcpServer(baseUrl = defaultBaseUrl()) {
  const server = new McpServer({ name: "clipai", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  registerTools(server, new ClipaiClient(baseUrl));
  return server;
}
