import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ComfyClient } from '../comfy-client.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const generateImageTool = {
  name: 'generate_image_url_from_prompt',
  description: 'Generates an image from a text prompt and returns a download URL.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Text description of the image to generate'
      },
      workflow_json: {
        type: 'string',
        description: 'Optional ComfyUI workflow JSON (API format) to use. If not provided, uses the default workflow.'
      }
    },
    required: ['prompt']
  }
};

export async function handleGenerateImage(
  comfyClient: ComfyClient,
  defaultWorkflowId: string,
  args: any,
  config?: { imagesDir: string; publicUrl: string }
) {
  const { prompt, workflow_json } = args;

  if (!prompt || typeof prompt !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: prompt is required and must be a string'
        }
      ],
      isError: true
    };
  }

  try {
    const workflowSource = workflow_json || defaultWorkflowId;
    const base64Image = await comfyClient.generateImage(workflowSource, prompt);
    let imageUrl = '';

    if (config) {
      const filename = `${randomUUID()}.png`;
      const savedPath = path.join(config.imagesDir, filename);
      fs.writeFileSync(savedPath, Buffer.from(base64Image, 'base64'));
      imageUrl = `${config.publicUrl}/images/${filename}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: imageUrl
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error generating image: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}
