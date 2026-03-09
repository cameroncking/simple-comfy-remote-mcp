import { ComfyClient } from '../comfy-client.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const inputSchema = {
  type: 'object',
  properties: {
    prompt: {
      type: 'string',
      description: 'Text description of image to generate'
    }
  },
  required: ['prompt']
};

export const generateImageUrlTool = {
  name: 'generate_image_url_from_prompt',
  description: 'Generates an image from a text prompt and returns a download URL.',
  inputSchema
};

export const imageGenerationTool = {
  name: 'generate_image',
  description: 'Generates an image from a text prompt and returns MCP image content for Open WebUI.',
  inputSchema
};

export async function handleGenerateImage(
  comfyClient: ComfyClient,
  workflowPath: string,
  args: any,
  mode: 'url' | 'openwebui',
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
    const generatedImage = await comfyClient.generateImage(workflowPath, prompt);
    let imageUrl = '';

    if (config && mode === 'url') {
      const extension = path.extname(generatedImage.filename) || '.png';
      const filename = `${randomUUID()}${extension}`;
      const savedPath = path.join(config.imagesDir, filename);
      fs.writeFileSync(savedPath, Buffer.from(generatedImage.base64Data, 'base64'));
      imageUrl = `${config.publicUrl}/images/${filename}`;
    }

    if (mode === 'openwebui') {
      return {
        content: [
          {
            type: 'text',
            text: 'Generated image successfully.'
          },
          {
            type: 'image',
            mimeType: generatedImage.mimeType,
            data: generatedImage.base64Data
          }
        ]
      };
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
