export {};

declare global {
  interface WebMCPToolInputSchema {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  }

  interface WebMCPTool {
    name: string;
    description: string;
    inputSchema: WebMCPToolInputSchema;
    execute: (args: any) => Promise<{ success: boolean; message?: string; [key: string]: any }>;
  }

  interface WebMCPContext {
    registerTool: (tool: WebMCPTool) => void;
    getTools: () => WebMCPTool[];
  }

  interface Document {
    modelContext?: WebMCPContext;
  }

  interface Window {
    __webmcp_tools__?: any;
    invokeWebMCPTool?: (toolName: string, args?: any) => Promise<any>;
  }
}

