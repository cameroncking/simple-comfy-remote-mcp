#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { ComfyClient } from './comfy-client.js';
import { generateImageTool, handleGenerateImage } from './tools/generate-image.js';
import fs from 'fs';
import path from 'path';

const COMFYUI_URL = process.env.COMFYUI_URL;
const COMFYUI_WORKFLOW_ID = process.env.COMFYUI_WORKFLOW_ID;
const MCP_PORT = parseInt(process.env.MCP_PORT || '3000', 10);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${MCP_PORT}`;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

if (!COMFYUI_URL) {
  console.error('Error: COMFYUI_URL environment variable is required');
  process.exit(1);
}

if (!COMFYUI_WORKFLOW_ID) {
  console.error('Error: COMFYUI_WORKFLOW_ID environment variable is required');
  process.exit(1);
}

const comfyClient = new ComfyClient(COMFYUI_URL);

function createServer() {
  const server = new Server(
    {
      name: 'comfy-image-generator',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [generateImageTool]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'generate_image_url_from_prompt') {
      return await handleGenerateImage(comfyClient, COMFYUI_WORKFLOW_ID!, args, {
        imagesDir: IMAGES_DIR,
        publicUrl: PUBLIC_URL
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${name}`
        }
      ],
      isError: true
    };
  });

  return server;
}

async function main() {
  const app = express();
  app.use(cors());
  // Serve generated images
  app.use('/images', express.static(IMAGES_DIR));
  
  // Remove express.json() to let the transport handle the body stream
  app.use((req, res, next) => {
    console.error(`${req.method} ${req.url}`);
    next();
  });

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless is safer for remote
  });

  app.all('/mcp', async (req, res) => {
    await transport.handleRequest(req, res);
  });

  // Fallback for root or older clients
  app.all('/', async (req, res) => {
    await transport.handleRequest(req, res);
  });

  await server.connect(transport);

  app.listen(MCP_PORT, '0.0.0.0', () => {
    console.error(`MCP Server running on http://0.0.0.0:${MCP_PORT}/mcp`);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});

