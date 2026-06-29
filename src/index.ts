#!/usr/bin/env node
import 'dotenv/config';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RenphoApiService } from './services/renpho-api.js';
import { loadConfig } from './config.js';
import { registerRenphoTools } from './mcp/register-tools.js';
import { createLogger, format, transports } from 'winston';

const config = loadConfig();

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'renpho-error.log', level: 'error' }),
    new transports.File({ filename: 'renpho-combined.log' })
  ]
});

const renphoApi = new RenphoApiService(config.email, config.password);

const server = new McpServer({
  name: 'renpho-mcp-server',
  version: '1.1.0'
});

registerRenphoTools(server, renphoApi, logger);

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Renpho MCP Server started successfully');
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

main().catch(error => {
  logger.error('Unhandled error', { error: (error as Error).message });
  process.exit(1);
});