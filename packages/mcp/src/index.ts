#!/usr/bin/env node
/**
 * Rayenz Hub MTG MCP server (stdio).
 * Env: HUB_API_URL, HUB_USERNAME, HUB_PASSWORD
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createHubClient, loadHubConfigFromEnv } from './hub-client.js';
import { createHubMcpServer } from './register-tools.js';

const handle = serveStdio(() => {
  const config = loadHubConfigFromEnv();
  const client = createHubClient(config);
  console.error(`rayenz-hub MCP: ${config.url}`);
  return createHubMcpServer(client);
});

process.on('SIGINT', () => {
  void handle.close();
});
process.on('SIGTERM', () => {
  void handle.close();
});
