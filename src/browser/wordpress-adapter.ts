/**
 * WordPress MCP HTTP adapter — JSON-RPC 2.0 client for wp-json/upgpt/v1/mcp endpoint.
 */

export interface WordPressClient {
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  listFiles(dir: string): Promise<string[]>;
  managePlugin(plugin: string, action: 'activate' | 'deactivate' | 'install' | 'uninstall'): Promise<string>;
  runWpCli(command: string): Promise<string>;
  readErrorLog(lines?: number): Promise<string>;
  getOptions(keys: string[]): Promise<Record<string, unknown>>;
  setOptions(options: Record<string, unknown>): Promise<void>;
  databaseQuery(sql: string): Promise<unknown[]>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

let _rpcId = 1;

async function rpc<T = unknown>(
  endpoint: string,
  apiKey: string,
  method: string,
  params: unknown
): Promise<T> {
  const id = _rpcId++;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WP-MCP-Key': apiKey,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  if (!response.ok) {
    throw new Error(`WordPress MCP HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as JsonRpcResponse<T>;

  if (data.error) {
    throw new Error(`WordPress MCP RPC error ${data.error.code}: ${data.error.message}`);
  }

  return data.result as T;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createWordPressClient(endpoint: string, apiKey: string): WordPressClient {
  const call = <T>(method: string, params: unknown) => rpc<T>(endpoint, apiKey, method, params);

  return {
    readFile: (filePath) => call<string>('readFile', { path: filePath }),
    writeFile: (filePath, content) => call<void>('writeFile', { path: filePath, content }),
    listFiles: (dir) => call<string[]>('listFiles', { dir }),
    managePlugin: (plugin, action) => call<string>('managePlugin', { plugin, action }),
    runWpCli: (command) => call<string>('runWpCli', { command }),
    readErrorLog: (lines = 100) => call<string>('readErrorLog', { lines }),
    getOptions: (keys) => call<Record<string, unknown>>('getOptions', { keys }),
    setOptions: (options) => call<void>('setOptions', { options }),
    databaseQuery: (sql) => call<unknown[]>('databaseQuery', { sql }),
  };
}
