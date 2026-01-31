# PRD: Simple ComfyUI MCP Server

## Overview

A minimal MCP (Model Context Protocol) server that exposes ComfyUI image generation capabilities. The server acts as a bridge between MCP clients and an existing ComfyUI installation, providing a way to generate images and serve them via public URLs.

## Goals

- Provide simplest possible MCP interface for text-to-image generation
- Serve generated images via public URLs for better client compatibility
- Zero configuration complexity for end users
- Stateless operation
- Enforce sysadmin control over workflows via local file paths

## Non-Goals

- Advanced ComfyUI workflow configuration at runtime (beyond prompt injection)
- Multiple tools or complex parameter handling
- Authentication/authorization for image access
- Long-term image persistence (designed for temporary prototyping)
- Workflow editing or management

## Architecture

```
┌─────────────┐     HTTP/SSE      ┌─────────────┐       REST API      ┌─────────────┐
│  MCP Client │ ◄──────────────► │  MCP Server │ ◄──────────────────► │   ComfyUI   │
│  (Claude,   │   (Streamable)   │  (Node.js)  │      (Polling)       │  (Existing) │
│   etc.)     │                  │      +      │                      │             │
└─────────────┘                  │   Express   │                      └─────────────┘
                                 └──────┬──────┘
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │ Local Disk  │
                                 │ (Public Dir)│
                                 └─────────────┘
```

## Configuration

All configuration via environment variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `COMFYUI_URL` | Yes | Base URL of ComfyUI instance | `http://localhost:8188` |
| `COMFYUI_WORKFLOW_ID` | Yes | Local file path to ComfyUI workflow JSON file | `/path/to/workflow.json` |
| `MCP_PORT` | No | Port for the MCP HTTP server | `3000` (default) |
| `PUBLIC_URL` | No | Public URL for image access | `https://your-server.com` |
| `COMFYUI_INPUT_NODE_ID` | No | Specific node ID for prompt injection | `6` |
| `COMFYUI_INPUT_FIELD_NAME` | No | Field name for prompt injection | `text` (default) |
| `COMFYUI_OUTPUT_NODE_ID` | No | Specific node ID for image output | `9` |
| `COMFYUI_OUTPUT_FIELD_NAME` | No | Field name for image output | `images` (default) |

## MCP Interface

### Server Info

- **Name**: `comfy-image-generator`
- **Version**: `1.0.0`
- **Transport**: Streamable HTTP

### Tools

#### `generate_image_url_from_prompt`

Generates an image from a text prompt using ComfyUI and returns a URL to the generated image.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Text description of the image to generate"
    }
  },
  "required": ["prompt"]
}
```

**Output:**
Returns the URL of the generated image as a text block.

```json
{
  "type": "text",
  "text": "http://localhost:3000/images/uuid-filename.png"
}
```

**Example:**
```json
// Request
{
  "prompt": "A serene mountain landscape at sunset with a lake reflection"
}

// Response
{
  "content": [
    {
      "type": "text",
      "text": "http://localhost:3000/images/550e8400-e29b-41d4-a716-446655440000.png"
    }
  ]
}
```

## Implementation Details

### Technology Stack

- **Runtime**: Node.js (LTS)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **HTTP Framework**: Express + Streamable HTTP transport
- **ComfyUI Client**: REST API (Polling `/history`)

### ComfyUI Integration Flow

  1. Receive `generate_image_url_from_prompt` tool call with prompt.
  2. Load workflow from local file path specified by `WORKFLOW_PATH`.
  3. Inject prompt into workflow and randomize seeds in all nodes.
4. Queue the workflow via ComfyUI's `/prompt` API.
5. Poll `/history/{prompt_id}` until execution completes.
6. Retrieve the generated image from ComfyUI's `/view` endpoint.
7. Save the image to the local `public/images` directory.
8. Return the public URL for the image.

### Prompt Injection Strategy

The server locates the prompt injection point by:
1. Using `COMFYUI_INPUT_NODE_ID` if provided.
2. Otherwise, finding the first `CLIPTextEncode` node in the workflow.
3. Replacing the field specified by `COMFYUI_INPUT_FIELD_NAME` (default: `text`) with the user-provided prompt.

Additionally, the server automatically finds any nodes with a `seed` input and randomizes them to ensure unique generations.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| ComfyUI unreachable | Return error: "ComfyUI server unavailable at {url}" |
 | Invalid workflow file | Return error: "Workflow not found: {path}. Must be a local file path." |
| Workflow execution fails | Return error: "Image generation failed: {comfy_error}" |
| Timeout (>5 min) | Return error: "Image generation timed out" |
| No image output | Return error: "Workflow did not produce an image output" |

## API Endpoints

The server uses Express to handle both MCP and static file serving:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | Main MCP message endpoint (JSON-RPC over HTTP) |
| `/mcp` | GET | SSE endpoint for server-to-client messages |
| `/images/*`| GET | Serves generated images from the local filesystem |

## Project Structure

```
simple-comfy-remote-mcp/
├── src/
│   ├── index.ts          # Entry point, server setup, Express config
│   ├── comfy-client.ts   # ComfyUI REST client with polling
│   └── tools/
│       └── generate-image.ts  # Tool implementation and image persistence
├── public/               # Served static assets
│   └── images/           # Generated images
├── package.json
├── tsconfig.json
├── .env.example
└── docs/
    └── PRD.md
```

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "dotenv": "^17.2.3",
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/dotenv": "^6.1.1",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.3"
  }
}
```

## Usage

### Starting the Server

```bash
# Set the required environment variables
export COMFYUI_URL=http://localhost:8188
export COMFYUI_WORKFLOW_ID=abc123-def456-ghi789-jkl012-mno345

# Start the server
npm start
```

### Connecting from MCP Clients

Configure your MCP client to connect to `http://localhost:3000/mcp` using the Streamable HTTP transport.

## Future Considerations (Out of Scope)

- Additional tools for workflow listing or model selection
- Configurable parameters (steps, CFG scale, etc.) via MCP tool arguments
- Batch generation
- Progress streaming during generation
- Image format options (JPEG, WebP)
- Automatic cleanup of old images in the `public/images` directory
