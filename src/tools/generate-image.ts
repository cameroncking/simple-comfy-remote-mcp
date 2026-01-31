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
        description: 'Text description of image to generate'
      }
    },
    required: ['prompt']
  }
};

export async function handleGenerateImage(
  comfyClient: ComfyClient,
  workflowPath: string,
  args: any,
  config?: { imagesDir: string; publicUrl: string }
) {
  const { prompt } = args;

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
    const base64Image = await comfyClient.generateImage(workflowPath, prompt);
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
