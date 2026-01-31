import WebSocket from 'ws';
import fs from 'fs';

export class ComfyClient {
  private baseUrl: string;
  private wsUrl: string;

  constructor(comfyUiUrl: string) {
    this.baseUrl = comfyUiUrl.endsWith('/') ? comfyUiUrl.slice(0, -1) : comfyUiUrl;
    this.wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  }

  async getWorkflow(workflowId: string): Promise<any> {
    // 1. Try to load as a local file
    if (fs.existsSync(workflowId)) {
      try {
        console.error(`Loading workflow from local file: ${workflowId}`);
        const content = fs.readFileSync(workflowId, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.error(`Error reading local workflow file: ${e}`);
      }
    }

    // 2. Explicitly handle 'latest'
    if (workflowId === 'latest') {
      return await this.getLatestWorkflow();
    }

    // 3. Try to fetch from history
    const url = `${this.baseUrl}/history/${workflowId}`;
    console.error(`Fetching workflow from history: ${url}`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        const history = await response.json();
        if (history[workflowId]?.prompt) {
          const promptData = history[workflowId].prompt;
          // In some versions of history, it's [prompt_id, node_id, prompt_data]
          return Array.isArray(promptData) ? promptData[2] : promptData;
        }
      }
    } catch (e) {
      console.error(`Error fetching history: ${e}`);
    }

    // 4. Fallback: try to get the most recent workflow from history
    console.error(`Workflow ${workflowId} not found. Attempting to fetch most recent workflow from history.`);
    return await this.getLatestWorkflow();
  }

  private async getLatestWorkflow(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/history`);
      if (response.ok) {
        const history = await response.json();
        const keys = Object.keys(history);
        if (keys.length > 0) {
          // Keys are usually prompt IDs, we want the one with the highest prompt number or latest timestamp
          // ComfyUI history keys are prompt IDs (UUIDs), but they are returned in order?
          // Actually, we should probably sort them or just take the last one.
          const mostRecentId = keys[keys.length - 1];
          console.error(`Using most recent workflow from history: ${mostRecentId}`);
          const promptData = history[mostRecentId].prompt;
          return Array.isArray(promptData) ? promptData[2] : promptData;
        }
      }
    } catch (e) {
      console.error(`Error fetching full history: ${e}`);
    }
    throw new Error(`Could not find any recent history.`);
  }

  private injectPrompt(workflow: any, prompt: string): any {
    const modifiedWorkflow = JSON.parse(JSON.stringify(workflow));
    const inputNodeId = process.env.COMFYUI_INPUT_NODE_ID;
    const inputFieldName = process.env.COMFYUI_INPUT_FIELD_NAME || 'text';

    console.error(`Injecting prompt into node ${inputNodeId || 'auto-detected'} field ${inputFieldName}`);

    let node;
    if (inputNodeId && modifiedWorkflow[inputNodeId]) {
      node = modifiedWorkflow[inputNodeId];
    } else {
      // Auto-detect CLIPTextEncode
      const entry = Object.entries(modifiedWorkflow).find(
        ([_, n]: [string, any]) => n.class_type === 'CLIPTextEncode'
      );
      if (entry) {
        node = entry[1];
        console.error(`Auto-detected CLIPTextEncode at node ${entry[0]}`);
      }
    }

    if (!node) {
      throw new Error('Could not find prompt input node');
    }

    node.inputs[inputFieldName] = prompt;

    // Randomize seed in any KSampler or similar nodes
    Object.values(modifiedWorkflow).forEach((n: any) => {
      if (n.inputs && 'seed' in n.inputs) {
        n.inputs.seed = Math.floor(Math.random() * 1000000000000000);
        console.error(`Randomized seed for node ${n.class_type}`);
      }
    });

    return modifiedWorkflow;
  }

  async queueWorkflow(workflow: any, prompt: string): Promise<string> {
    const modifiedWorkflow = this.injectPrompt(workflow, prompt);
    const url = `${this.baseUrl}/prompt`;
    console.error(`Queueing workflow to ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: modifiedWorkflow })
    });

    if (!response.ok) {
      throw new Error(`Failed to queue workflow: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.node_errors && Object.keys(data.node_errors).length > 0) {
      throw new Error(`Workflow validation failed: ${JSON.stringify(data.node_errors)}`);
    }

    console.error(`Prompt queued with ID ${data.prompt_id}`);
    return data.prompt_id;
  }

  async waitForCompletion(promptId: string, timeoutMs: number = 300000): Promise<string | null> {
    console.error(`Waiting for completion of ${promptId} via polling...`);
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(`${this.baseUrl}/history/${promptId}`);
        if (response.ok) {
          const history = await response.json();
          if (history[promptId]) {
            console.error(`Prompt ${promptId} finished`);
            return 'done'; // We don't strictly need the node ID here as we'll find the output in history
          }
        }
      } catch (e) {
        console.error(`Error polling history: ${e}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Image generation timed out');
  }

  async getImage(filename: string, subfolder: string = '', type: string = 'output'): Promise<string> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const url = `${this.baseUrl}/view?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to retrieve image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }

  async generateImage(workflowSource: string | any, prompt: string): Promise<string> {
    let workflow;
    if (typeof workflowSource === 'string') {
      // Check if it looks like JSON
      if (workflowSource.trim().startsWith('{')) {
        try {
          workflow = JSON.parse(workflowSource);
        } catch (e) {
          console.error(`Error parsing workflow JSON: ${e}`);
        }
      }

      if (!workflow) {
        workflow = await this.getWorkflow(workflowSource);
      }
    } else {
      workflow = workflowSource;
    }

    const promptId = await this.queueWorkflow(workflow, prompt);
    await this.waitForCompletion(promptId);

    const historyUrl = `${this.baseUrl}/history/${promptId}`;
    const historyResponse = await fetch(historyUrl);
    const historyData = await historyResponse.json();

    const outputs = historyData[promptId]?.outputs;
    if (!outputs) {
      throw new Error('No outputs found in workflow execution');
    }

    const outputNodeId = process.env.COMFYUI_OUTPUT_NODE_ID;
    const outputFieldName = process.env.COMFYUI_OUTPUT_FIELD_NAME || 'images';
    let nodeOutput;

    if (outputNodeId && outputs[outputNodeId]) {
      nodeOutput = outputs[outputNodeId];
    } else {
      // Find first output with the specified field
      nodeOutput = Object.values(outputs).find((o: any) => o[outputFieldName] && o[outputFieldName].length > 0);
    }

    if (nodeOutput?.[outputFieldName] && nodeOutput[outputFieldName].length > 0) {
      const image = nodeOutput[outputFieldName][0];
      return await this.getImage(image.filename, image.subfolder || '', image.type || 'output');
    }

    throw new Error(`No image found in workflow outputs (field: ${outputFieldName})`);
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
