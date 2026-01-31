# Simple ComfyUI MCP Server

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![npm version](https://badge.fury.io/js/simple-comfy-remote-mcp.svg)](https://www.npmjs.com/package/simple-comfy-remote-mcp)

A minimal Model Context Protocol (MCP) server that exposes ComfyUI image
generation as a single tool over HTTP.

## Overview

This server provides a simple MCP interface for text-to-image generation using
ComfyUI. It accepts a text prompt and returns a URL.

## Use Case

There are other ComfyUI image generation MCPs already published; however, they
run locally on the client.  This MCP provides an HTTP endpoint, which makes
sense for cases where image generation is being provided over the network to
multiple users.  By centralizing the MCP onto the remote server, the sysadmin
has control over the workflow UUID and node parameters.  This allows for
workflows to be updated serverside as new models come out, without requiring
client-side updates.

## Features

- Single `generate_image` tool
- Simple prompt-based image generation
- Streamable HTTP transport
- Stateless operation
- Automatic prompt injection into ComfyUI workflows

## Prerequisites

- Node.js 20+
- Running ComfyUI instance
- ComfyUI workflow with a `CLIPTextEncode` node

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file or set the following environment variables:

```bash
# Required: URL of your ComfyUI instance
COMFYUI_URL=http://localhost:8188

# Required: ID of the ComfyUI workflow to execute
COMFYUI_WORKFLOW_ID=your-workflow-id-here

# Optional: Port for the MCP HTTP server (default: 3000)
MCP_PORT=3000

# Optional: Public URL for image downloads (default: http://localhost:3000)
PUBLIC_URL=http://localhost:3000

# Optional: Node ID for prompt injection (auto-detects first CLIPTextEncode if not set)
COMFYUI_INPUT_NODE_ID=

# Optional: Field name for prompt injection (default: text)
COMFYUI_INPUT_FIELD_NAME=

# Optional: Node ID for image output (auto-detects first SaveImage if not set)
COMFYUI_OUTPUT_NODE_ID=

# Optional: Field name for image output (default: images)
COMFYUI_OUTPUT_FIELD_NAME=
```

## Building

```bash
npm run build
```

## Running

```bash
npm start
```

The server will start on `http://localhost:3000/mcp`.

## Docker

### Using Docker Compose (Recommended)

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your ComfyUI configuration:
```bash
COMFYUI_URL=http://localhost:8188
COMFYUI_WORKFLOW_ID=your-workflow-id-here
MCP_PORT=3000
PUBLIC_URL=http://localhost:3000
```

3. Build and start the container:
```bash
docker-compose up -d
```

The server will be available at `http://localhost:3000/mcp`.

Note: The `COMFYUI_URL` uses `host.docker.internal` in the docker-compose.yml to access ComfyUI running on your host machine.

### Using Docker Directly

1. Build the image:
```bash
docker build -t comfy-mcp .
```

2. Run the container:
```bash
docker run -d \
  -p 3000:3000 \
  -e COMFYUI_URL=http://host.docker.internal:8188 \
  -e COMFYUI_WORKFLOW_ID=your-workflow-id-here \
  -e MCP_PORT=3000 \
  -e PUBLIC_URL=http://localhost:3000 \
  -v $(pwd)/public/images:/app/public/images \
  --name comfy-mcp-server \
  comfy-mcp
```

## Usage

### Connecting from MCP Clients

Configure your MCP client to connect to the server:

**For HTTP transport:**
```
Endpoint: http://localhost:3000/mcp
Transport: Streamable HTTP
```

### Example: Using the Tool

Once connected, you can call the `generate_image_url_from_prompt` tool:

```json
{
  "name": "generate_image_url_from_prompt",
  "arguments": {
    "prompt": "A serene mountain landscape at sunset with a lake reflection"
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "http://localhost:3000/images/..."
    }
  ]
}
```

## Workflow Requirements

The ComfyUI workflow must include:
- A `CLIPTextEncode` node for the positive prompt (or specify
`COMFYUI_INPUT_NODE_ID`)
- At least one SaveImage node (or specify `COMFYUI_OUTPUT_NODE_ID`)

**Auto-detection:** By default, the server automatically finds the first
`CLIPTextEncode` node for prompt injection and the first SaveImage node for
output. For workflows with multiple such nodes or different node types, use the
optional environment variables to specify which nodes and fields to use.

## OpenCode Example

In _~/.config/opencode/config.json_:

```
{
  "$schema": "https://opencode.ai/config.json",
  "command": {
    "image-generator": {
      "template": "User Request: $ARGUMENTS\n\nYou are an image generation specialist. When a user requests an image:\n\n1. Transform their request into a detailed, effective image prompt that will produce high-quality results\n2. Use the `image-generator_generate_image_url_from_prompt` tool to generate the image\n3. Return the response with:\n   - The actual prompt you used (in clear text)\n   - The image embedded as markdown: \n![image description](<image_url>)\n   - The raw image URL (for interfaces that don't render images)\n\nBe concise and direct. Always include all three elements: the prompt text, the markdown image, and the raw URL.\n\n## Example Output:\n\nUser: Draw me a cat\n\nYour response:\nPrompt: A playful orange tabby cat sitting on a windowsill, soft natural lighting, cozy home setting, digital art style, warm colors, detailed fur texture\n\n![orange tabby cat](https://example.com/images/generated-abc123.jpg)\n\nImage URL: https://example.com/images/generated-abc123.jpg",
      "description": "Generates an image"
    }
  },
  "mcp": {
    "image-generator": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/mcp",
      "enabled": true
    }
  }
}
```

## Error Handling

| Error | Description |
|-------|-------------|
| `ComfyUI server unavailable` | Cannot connect to ComfyUI at the configured URL |
| `Workflow not found` | The workflow ID doesn't exist in ComfyUI |
| `No CLIPTextEncode node found` | The workflow doesn't have a prompt input node |
| `Image generation timed out` | Generation took longer than 5 minutes |
| `Workflow did not produce an image output` | No image was generated |

## Troubleshooting

### Server fails to start

- Verify that `COMFYUI_URL` and `COMFYUI_WORKFLOW_ID` are set
- Ensure ComfyUI is running and accessible at the configured URL

### Tool returns "Workflow not found"

- Check that the `COMFYUI_WORKFLOW_ID` matches an existing workflow in ComfyUI
- In ComfyUI, check the URL to find your workflow ID (e.g., `/prompt/12345`
where `12345` is the ID)

### Tool returns "No CLIPTextEncode node found"

- Your workflow must include a `CLIPTextEncode` class node
- This is typically the node that receives the positive text prompt

### Generation times out

- Check that ComfyUI has enough GPU resources
- Try reducing the workflow complexity (steps, resolution, etc.)
- The default timeout is 5 minutes; adjust if needed

## Development

```bash
# Build and run in development mode
npm run dev
```

## License

ISC
