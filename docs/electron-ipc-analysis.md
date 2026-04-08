# Electron IPC Analysis for @deessejs Architecture

## Executive Summary

This document analyzes how a tRPC-like architecture (such as @deessejs) could support native Electron applications using Electron's Inter-Process Communication (IPC) mechanism. The analysis covers Electron IPC fundamentals, security considerations, type-sharing patterns, and provides concrete implementation recommendations.

**Key Findings:**
- Electron IPC using `contextBridge` + `ipcMain.handle()` provides a secure, type-safe communication channel
- A tRPC-like system can leverage the same protocol design used for HTTP, adapting it to IPC transport
- The `AppRouter` type sharing pattern works identically in Electron (using `import type`)
- Performance advantages over HTTP include lower latency and no serialization overhead for local communication
- Security requires strict adherence to context isolation and minimal API exposure via preload scripts

---

## Electron IPC Architecture Explanation

### Process Model

Electron has two primary process types:

1. **Main Process** - Node.js runtime that has full OS access, manages windows, and handles application lifecycle
2. **Renderer Process** - Chromium-based web page that runs in an isolated context with limited API access

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN PROCESS                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │              @deessejs Server                   │     │
│  │         (AppRouter, Procedures)                │     │
│  └─────────────────────────────────────────────────┘     │
│                          │                               │
│                   ipcMain.handle()                       │
└──────────────────────────┼───────────────────────────────┘
                           │ contextBridge
                           │ (secure boundary)
┌──────────────────────────┼───────────────────────────────┐
│                    RENDERER PROCESS                       │
│                          │                                │
│  ┌─────────────────────────────────────────────────┐     │
│  │           window.electronAPI (preload)           │     │
│  └─────────────────────────────────────────────────┘     │
│                          │                                │
│  ┌─────────────────────────────────────────────────┐     │
│  │         @deessejs Client + React Query          │     │
│  └─────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
```

### IPC Communication Patterns

Electron provides four primary IPC patterns:

| Pattern | Use Case | API |
|---------|----------|-----|
| Renderer to Main (one-way) | Fire-and-forget events | `ipcRenderer.send()` + `ipcMain.on()` |
| Renderer to Main (two-way) | Request-response | `ipcRenderer.invoke()` + `ipcMain.handle()` |
| Main to Renderer | Server-sent events | `webContents.send()` + `ipcRenderer.on()` |
| Renderer to Renderer | Cross-window | MessagePort or main as broker |

The **recommended pattern** for tRPC-like architectures is the two-way request-response pattern using `invoke`/`handle`.

### Key APIs

**ipcMain (Main Process):**
```typescript
import { ipcMain } from 'electron';

ipcMain.handle('channel-name', async (event, args) => {
  // args contains the deserialized input
  // Return value is serialized and sent back to renderer
  return result;
});
```

**ipcRenderer (Preload Script):**
```typescript
import { contextBridge, ipcRenderer } from 'electron';

// Safe exposure to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)
});
```

**contextBridge:**
```typescript
// preload.ts
contextBridge.exposeInMainWorld('myAPI', {
  loadPreferences: () => ipcRenderer.invoke('load-prefs'),
  savePreferences: (prefs: Preferences) =>
    ipcRenderer.invoke('save-prefs', prefs)
});
```

---

## How a tRPC-like System Could Work with Electron IPC

### Conceptual Mapping

| tRPC (HTTP) | Electron IPC |
|-------------|--------------|
| HTTP Request/Response | `ipcRenderer.invoke()` / `ipcMain.handle()` |
| JSON body | Structured-clone serialization |
| URL path (e.g., `/trpc/greeting.query`) | IPC channel + procedure path |
| HTTP adapter | IPC adapter in main process |
| HTTP Link | IPC Link in preload script |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        MAIN PROCESS                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              @deessejs/server                          │   │
│  │                                                       │   │
│  │  const appRouter = router({                           │   │
│  │    greeting: publicProcedure.query(() => 'hello'),     │   │
│  │  });                                                  │   │
│  │                                                       │   │
│  │  ipcMain.handle('trpc', async (_event, { path,       │   │
│  │    type, input }) => {                               │   │
│  │    const caller = appRouter.createCaller({});         │   │
│  │    return caller[path](input);                        │   │
│  │  });                                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                    IPC Channel: 'trpc'
                           │
┌─────────────────────────────────────────────────────────────┐
│                      PRELOAD SCRIPT                          │
│                                                              │
│  contextBridge.exposeInMainWorld('trpc', createIPCClient());│
└─────────────────────────────────────────────────────────────┘
                           │
                    window.trpc
                           │
┌─────────────────────────────────────────────────────────────┐
│                     RENDERER PROCESS                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            @deessejs/client + React Query              │   │
│  │                                                       │   │
│  │  const trpc = useTRPC();                              │   │
│  │  const hello = useQuery(trpc.greeting.queryOptions());│   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### IPC Link Implementation

The key to making this work is implementing an IPC Link for the @deessejs client:

```typescript
// packages/client/src/links/ipcLink.ts
import { httpBatchLink } from '@deessejs/client/links/httpBatchLink';
import { TRPCLink } from '@deessejs/client';

export const ipcLink = (options: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> }): TRPCLink => {
  return ({ op, prev }) => {
    const { path, type, input } = op;

    // Convert tRPC operation to IPC call
    options.invoke('trpc', { path, type, input })
      .then((result) => prev({ data: result }))
      .catch((error) => prev({ error }));
  };
};
```

---

## Type Sharing Pattern Between Main and Renderer

The type sharing pattern works **identically** to how tRPC handles HTTP type sharing. The key is using `import type` to ensure no server code leaks into the client bundle.

### Main Process (Server)

```typescript
// packages/server/src/main/router.ts
import { initTRPC } from '@deessejs/server';
import { z } from 'zod';

const t = initTRPC.context<{ userId: string | null }>().create();
export const publicProcedure = t.procedure;

export const appRouter = t.router({
  greeting: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ message: `Hello, ${input.name}!` })),

  createFile: publicProcedure
    .input(z.object({ path: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      // Access to Node.js fs, dialog, etc.
      const fs = await import('fs/promises');
      await fs.writeFile(input.path, input.content);
      return { success: true };
    }),
});

// Type-only export - NO runtime export
export type AppRouter = typeof appRouter;
```

### Preload Script (Bridge)

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { createTRPCProxyClient } from '@deessejs/client';
import type { AppRouter } from '@deessejs/server'; // Type-only import

// Create the IPC-based client
const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [{
    link: (opts, next) => ({
      subscribe: (observer) => {
        // Handle subscriptions via main-to-renderer events
        const unsubscribe = ipcRenderer.on('trpc:event', (_event, data) => {
          observer.next(data);
        });
        return unsubscribe;
      },
      call: (op) => {
        return ipcRenderer.invoke('trpc', {
          path: op.path,
          type: op.type,
          input: op.input,
        }) as Promise<unknown>;
      },
    }),
  }],
});

contextBridge.exposeInMainWorld('trpc', trpcClient);
```

### Renderer Process (Client)

```typescript
// renderer/App.tsx
import type { AppRouter } from '@deessejs/server'; // Type-only import
import { createTRPCClient, httpBatchLink } from '@deessejs/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCContext } from '@deessejs/client-react';

// The type is used but never brings server code into the bundle
type AppRouter = typeof import('@deessejs/server').appRouter;

const trpcClient = createTRPCClient<AppRouter>({
  links: [{
    link: (opts, next) => ({
      // ... IPC implementation
    }),
  }],
});

function App() {
  return (
    <trpc.Provider client={trpcClient}>
      <QueryClientProvider client={queryClient}>
        <GreetingComponent />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

// Usage with full type safety
function GreetingComponent() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.greeting.queryOptions({ name: 'World' }));

  return <h1>{data?.message}</h1>;
}
```

### Type Safety Flow

```
Server (appRouter)
    │
    │  TypeScript: typeof appRouter
    │  import type (compile-time only, zero runtime cost)
    ▼
Preload Script (creates proxy client with AppRouter type)
    │
    │  contextBridge.exposeInMainWorld('trpc', proxy)
    ▼
Renderer (window.trpc is typed as AppRouter)
    │
    │  Full autocomplete, type checking
    ▼
Type-safe procedure calls
```

---

## Implementation Considerations for @deessejs

### 1. New Package: `@deessejs/electron`

A dedicated Electron package would provide:

```
packages/electron/
├── src/
│   ├── main/
│   │   ├── createIpcHandler.ts      # ipcMain.handle() wrapper
│   │   └── index.ts
│   ├── preload/
│   │   ├── exposeApi.ts              # contextBridge utilities
│   │   └── index.ts
│   ├── client/
│   │   ├── ipcLink.ts                # IPC transport link
│   │   └── index.ts
│   └── shared/
│       └── types.ts                  # Shared IPC channel types
├── package.json
└── tsconfig.json
```

### 2. IPC Handler Creation

```typescript
// packages/electron/src/main/createIpcHandler.ts
import { ipcMain } from 'electron';
import type { AnyRouter } from '@deessejs/server';

export function createElectronHandler(router: AnyRouter) {
  ipcMain.handle('trpc', async (event, { path, type, input }) => {
    const caller = router.createCaller({});

    try {
      // Parse path like "greeting.query" to call router.greeting.query()
      const result = await callProcedure(caller, path, input);
      return { ok: true, data: result };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? { message: error.message } // Only serialize message
          : { message: 'Unknown error' }
      };
    }
  });
}

async function callProcedure(caller: any, path: string, input: unknown) {
  const parts = path.split('.');
  let current = caller;

  for (const part of parts) {
    current = current[part];
  }

  return current(input);
}
```

### 3. Preload API Exposure

```typescript
// packages/electron/src/preload/exposeApi.ts
import { contextBridge, ipcRenderer } from 'electron';

export interface ExposedAPI {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

export function exposeInMainWorld(name: string, api: ExposedAPI) {
  contextBridge.exposeInMainWorld(name, api);
}

// Helper to create the standard trpc API
export function createTrpcPreloadApi() {
  return {
    invoke: <T = unknown>(channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args) as Promise<T>,

    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
        callback(...args);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.off(channel, handler);
    },
  };
}
```

### 4. IPC Link for Client

```typescript
// packages/electron/src/client/ipcLink.ts
import type { TRPCLink, TRPCOperation } from '@deessejs/client';

export interface IpcLinkOptions {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
}

export function ipcLink(options: IpcLinkOptions): TRPCLink {
  return ({ op, prev }) => {
    const { path, type, input } = op as TRPCOperation;

    const channel = 'trpc';
    const payload = { path, type, input };

    options.invoke<{ ok: boolean; data?: unknown; error?: { message: string } }>(
      channel,
      payload
    )
      .then((result) => {
        if (result.ok) {
          prev({ data: result.data });
        } else {
          prev({ error: new Error(result.error?.message ?? 'Unknown error') });
        }
      })
      .catch((error) => {
        prev({ error: error instanceof Error ? error : new Error(String(error)) });
      });
  };
}
```

---

## Code Examples Showing the Concept

### Complete Example: File Explorer

**Main Process:**

```typescript
// main/index.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { createElectronHandler } from '@deessejs/electron/main';
import { appRouter } from './router';

let mainWindow: BrowserWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: './preload.js',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Register the tRPC handler
  createElectronHandler(appRouter);

  mainWindow.loadFile('./renderer/index.html');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

**Server Router:**

```typescript
// main/router.ts
import { initTRPC } from '@deessejs/server';
import { z } from 'zod';
import fs from 'fs/promises';

const t = initTRPC.context<{ userId: string }>().create();
export const publicProcedure = t.procedure;

export const appRouter = t.router({
  selectFile: publicProcedure
    .query(async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({});
      return canceled ? null : filePaths[0];
    }),

  readFile: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input }) => {
      const content = await fs.readFile(input.path, 'utf-8');
      return { path: input.path, content };
    }),

  writeFile: publicProcedure
    .input(z.object({
      path: z.string(),
      content: z.string()
    }))
    .mutation(async ({ input }) => {
      await fs.writeFile(input.path, input.content);
      return { success: true };
    }),
});

export type AppRouter = typeof appRouter;
```

**Preload Script:**

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { createTRPCProxyClient, ipcLink } from '@deessejs/electron/client';
import type { AppRouter } from './router';

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    ipcLink({
      invoke: (channel, ...args) =>
        ipcRenderer.invoke(channel, ...args) as Promise<unknown>,
    }),
  ],
});

contextBridge.exposeInMainWorld('trpc', trpc);
```

**Renderer:**

```typescript
// renderer/app.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { createTRPCClient, createTRPCContext } from '@deessejs/client-react';
import type { AppRouter } from '@deessejs/server';

// Type-only import
const trpcClient = createTRPCClient<AppRouter>({
  links: [
    ipcLink({
      invoke: window.electronAPI.invoke,
    }),
  ],
});

const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function FileExplorer() {
  const trpc = useTRPC();

  const selectFileMutation = useMutation(
    trpc.selectFile.mutationOptions()
  );

  const readFileQuery = useQuery(
    trpc.readFile.queryOptions({ path: '/path/to/file' })
  );

  return (
    <div>
      <button onClick={() => selectFileMutation.mutate()}>
        Select File
      </button>

      {readFileQuery.data && (
        <pre>{readFileQuery.data.content}</pre>
      )}
    </div>
  );
}
```

### React Query Integration Pattern

```typescript
// packages/client-react/src/createTRPCContext.ts
import { createContext, useContext } from 'react';
import { createTRPCClient, TRPCClient } from '@deessejs/client';

export function createTRPCContext<AppRouter extends AnyRouter>() {
  const TRPCContext = createContext<TRPCClient<AppRouter> | null>(null);

  return {
    TRPCProvider: ({ client, children }) => (
      <TRPCContext.Provider value={client as TRPCClient<AppRouter>}>
        {children}
      </TRPCContext.Provider>
    ),

    useTRPC: () => {
      const client = useContext(TRPCContext);
      if (!client) throw new Error('useTRPC must be used within TRPCProvider');
      return client;
    },
  };
}
```

---

## Security Best Practices

### 1. Always Enable Context Isolation

```typescript
// main/index.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: './preload.js',
    contextIsolation: true,  // REQUIRED
    nodeIntegration: false,  // REQUIRED
    sandbox: true,           // RECOMMENDED
  },
});
```

### 2. Minimal API Exposure via Preload

**Bad (insecure):**
```typescript
// DO NOT DO THIS
contextBridge.exposeInMainWorld('electron', {
  fs: require('fs'),  // EXPOSES FULL Node.js API - DANGEROUS!
  ipcRenderer,        // EXPOSES RAW IPC - DANGEROUS!
});
```

**Good (secure):**
```typescript
// DO THIS - Minimal, typed API
contextBridge.exposeInMainWorld('trpc', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, callback) => {
    const handler = (_e, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.off(channel, handler);
  },
});
```

### 3. Input Validation and Sanitization

```typescript
// In your IPC handler, always validate inputs
ipcMain.handle('trpc', async (event, rawInput) => {
  // Validate the channel name
  if (typeof rawInput !== 'object' || rawInput === null) {
    throw new Error('Invalid input');
  }

  const { path, type, input } = rawInput as {
    path: string;
    type: string;
    input: unknown;
  };

  // Validate path doesn't contain prototype pollution
  if (path.includes('__proto__') || path.includes('constructor')) {
    throw new Error('Invalid path');
  }

  // Proceed with validated input
});
```

### 4. Error Message Sanitization

```typescript
// Only expose safe error information
ipcMain.handle('trpc', async (event, input) => {
  try {
    return await caller[path](input);
  } catch (error) {
    // Only return message, not stack traces or internal details
    return {
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        // DO NOT include: error.stack, error.code, etc.
      }
    };
  }
});
```

### 5. Use the Minimal Permission Principle

```typescript
// If your app only needs file dialogs, only expose that
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content: string) => ipcRenderer.invoke('dialog:saveFile', content),
});
```

---

## Performance Considerations

### IPC vs HTTP for Local Electron Apps

| Aspect | IPC | HTTP (localhost) |
|--------|-----|------------------|
| Latency | ~0.1-1ms | ~1-5ms |
| Serialization | Structured clone | JSON parse/stringify |
| Connection overhead | None | TCP handshake |
| Batching | Manual | httpBatchLink |
| Browser bundled | No | No |

### Performance Optimizations

**1. Batch Multiple Operations:**
```typescript
// Enable batching in your IPC link
const ipcLink = createIPCLink({
  invoke: async (requests) => {
    // Batch multiple requests into single IPC call
    const results = await ipcRenderer.invoke('trpc:batch', requests);
    return results;
  },
});
```

**2. Use Structured Clone for Large Data:**
```typescript
// Electron's structured clone is faster than JSON
// Works for: primitives, arrays, objects, Map, Set, Date, RegExp, Blob, etc.
// Does NOT work for: functions, DOM nodes, symbols
```

**3. Avoid Frequent Small IPC Calls:**
```typescript
// Bad: Multiple round trips
const user = await trpc.getUser.query({ id: 1 });
const posts = await trpc.getPosts.query({ userId: 1 });

// Good: Use a single query that fetches both
const data = await trpc.getUserWithPosts.query({ id: 1 });
```

### Memory Considerations

- **Renderer memory is shared** across BrowserViews but isolated per window
- **Large payloads** should be handled via sharedArrayBuffer or streaming
- **Subscription cleanup** must be explicit to avoid memory leaks

---

## Risks and Recommendations

### Security Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Remote Code Execution via preload | Critical | Never expose Node.js APIs; use contextBridge |
| Prototype pollution in path parsing | High | Validate and sanitize all path inputs |
| Error message leakage | Medium | Only expose error.message, never stack traces |
| DOM-based XSS in renderer | Medium | Sanitize data before rendering |

### Architectural Risks

| Risk | Mitigation |
|------|------------|
| Type drift between main/renderer | Use monorepo with shared types package |
| Breaking changes require rebuild | Use semantic versioning; provide migration guides |
| Complex subscription handling | Implement proper cleanup in preload; use WeakMap for observers |

### Recommendations

1. **Start with HTTP for development, IPC for production**
   - Easier debugging with HTTP (use Charles Proxy, etc.)
   - Switch transport layer without changing application logic

2. **Use a dedicated `@deessejs/electron` package**
   - Isolates Electron-specific code
   - Easier to maintain and test
   - Clear separation of concerns

3. **Implement proper error boundaries**
   ```typescript
   // In React components
   class ErrorBoundary extends React.Component {
     componentDidCatch(error, info) {
       // Log to main process for monitoring
       window.trpc.logError({
         message: error.message,
         stack: info.componentStack
       });
     }
   }
   ```

4. **Test IPC communication separately**
   - Unit test the IPC handler in isolation
   - Integration test the full main-to-renderer flow
   - Use Electron's testing utilities (@electron/test)

5. **Consider streaming for large data**
   - Use `webContents.send()` with streaming for large files
   - Consider WebWorkers for heavy processing in renderer

---

## Conclusion

A tRPC-like architecture like @deessejs can effectively support Electron IPC with minimal changes to the core protocol design. The key implementation points are:

1. **Transport adaptation** - Replace HTTP Link with IPC Link in preload script
2. **Handler registration** - Use `ipcMain.handle()` to expose procedures
3. **Type sharing** - Works identically to HTTP via `import type`
4. **Security** - Critical to use contextBridge with minimal API exposure
5. **React Query integration** - Unchanged from standard @tanstack/react-query setup

The performance advantages over HTTP (lower latency, no network stack overhead) make IPC an excellent choice for local Electron applications. The architecture maintains full type safety end-to-end while providing a familiar developer experience.

---

## References

- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/ipc-main)
- [Electron Context Isolation](https://www.electronjs.org/docs/tutorial/context-isolation)
- [Electron Security Best Practices](https://www.electronjs.org/docs/tutorial/security)
- [tRPC Documentation](https://trpc.io/docs)
- [TanStack React Query](https://tanstack.com/query/v5)
- [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
