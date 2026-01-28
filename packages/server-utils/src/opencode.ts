import { join, dirname } from "node:path";
import { env } from "@kinetic-context/env/server";
import { logger } from "./logger";
import {
  readGlobalConfig,
  readOpencodeConfig,
  readPackageConfig,
  writePackageConfig,
} from "./config";

/**
 * Get the opencode server URL from environment variable.
 * In Docker, this points to the opencode container.
 * In development, this can point to a local opencode instance.
 */
function getOpencodeUrl(): string {
  const url = env.OPENCODE_URL;
  logger.log("[opencode]", `Using opencode URL: ${url}`);
  return url;
}

/**
 * Helper to create a timeout promise
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
}

/**
 * Wrapper for fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Fetch request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Generic timeout wrapper for promises
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(timeoutMs).then(() => {
      throw new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`);
    }),
  ]);
}

/**
 * Poll for messages with timeout and retry logic
 */
async function pollForMessages(
  opencodeUrl: string,
  sessionId: string,
  repoPath: string,
  fetchTimeoutMs: number,
  pollIntervalMs: number,
  maxAttempts: number,
): Promise<unknown> {
  const messagesUrl = `${opencodeUrl}/session/${encodeURIComponent(sessionId)}/message?limit=5`;
  const urlObj = new URL(messagesUrl);
  if (repoPath) {
    urlObj.searchParams.set("directory", encodeURIComponent(repoPath));
  }
  const finalUrl = urlObj.toString();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(
        finalUrl,
        {
          headers: {
            "x-opencode-directory": repoPath,
          },
        },
        fetchTimeoutMs,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch messages: HTTP ${response.status} - ${errorText}`,
        );
      }

      const messagesData = (await response.json()) as unknown;

      if (!Array.isArray(messagesData)) {
        throw new Error(
          `Invalid messages response: expected array, got ${typeof messagesData}`,
        );
      }

      const assistantMessage = (messagesData as Array<{ info?: { role?: string }; parts?: unknown[] }>).find(
        (msg) => msg.info && msg.info.role === "assistant",
      );

      if (assistantMessage?.parts?.length > 0) {
        return assistantMessage;
      }

      // If no assistant message yet, wait and retry
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    } catch (error) {
      // If it's a timeout or last attempt, throw
      if (
        error instanceof Error &&
        error.message.includes("timed out")
      ) {
        throw error;
      }
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      // Otherwise, wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  throw new Error(
    `No assistant message found after ${maxAttempts} polling attempts`,
  );
}

/**
 * Default agent prompt for OpenCode sessions
 */
const DEFAULT_AGENT_PROMPT = `You are an AI agent whose job is to answer questions about the codebase you are asked about. Your primary responsibility is to help developers understand how to use dependencies and codebases effectively. When answering questions:

1. Provide clear, practical answers with code examples when relevant
2. Reference specific files, functions, or patterns in the codebase when possible
3. Explain not just what the code does, but how to use it effectively
4. If the question is ambiguous, ask clarifying questions
5. Focus on helping developers understand how to integrate and use the dependency in their projects
6. If you need to explore the repository (e.g. read files, run commands), do so first, then give your full answer in the same response. Do not send only a short placeholder (e.g. "Let me explore...") and then stop—include your findings and complete answer in one reply.

IMPORTANT: The working directory for this session is set to the repository root. When executing shell commands, you should operate from this directory. If you need to change directories, use 'cd' to navigate, but remember that the repository root is your base working directory.`;

/**
 * Prompt used to generate kctx_helper repository summary (background, 3x timeout).
 */
const KCTX_HELPER_SUMMARY_PROMPT =
  "Provide a concise summary of this repository: its purpose, main exports or entry points, and key patterns or conventions. This summary will be used to give context to future questions about the repository. Reply with only the summary text, no preamble.";

export interface OpencodeModel {
  providerID: string;
  modelID: string;
}

export async function* queryOpencodeStream(
  repoPath: string,
  query: string,
  model?: OpencodeModel,
  sessionId?: string,
  kctxHelper?: string,
): AsyncGenerator<{ text: string; done: boolean; sessionId?: string; thinking?: string }, void, unknown> {
  logger.log("[opencode]", `Starting streaming query for directory: ${repoPath}`);
  logger.log("[opencode]", `Query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`);
  if (model) {
    logger.log("[opencode]", `Using model: ${model.providerID}/${model.modelID}`);
  }

  const opencodeUrl = getOpencodeUrl();
  logger.log("[opencode]", `Server URL: ${opencodeUrl}`);

  // Create client with the repository directory
  let createOpencodeClient: (opts: { baseUrl: string; directory: string }) => unknown;
  try {
    const module = await import("@opencode-ai/sdk");
    createOpencodeClient = module.createOpencodeClient as typeof createOpencodeClient;
    logger.log("[opencode]", "Using client from @opencode-ai/sdk package");
  } catch {
    logger.log("[opencode]", "Falling back to local context client");
    const opencodePath = join(
      process.cwd(),
      "context",
      "opencode",
      "packages",
      "sdk",
      "js",
      "src",
      "index.ts",
    );
    const module = await import(opencodePath);
    createOpencodeClient = module.createOpencodeClient as typeof createOpencodeClient;
  }

  logger.log("[opencode]", `Creating client with baseUrl: ${opencodeUrl}, directory: ${repoPath}`);
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: repoPath,
  }) as {
    session: { create: (opts: unknown) => Promise<unknown>; prompt: (opts: unknown) => Promise<unknown> };
    event: { subscribe: () => Promise<{ stream: AsyncIterable<{ type: string; properties?: unknown }> }> };
  };

  // Create or reuse session
  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const sessionTitle = `Query: ${query.substring(0, 50)}`;
    logger.log("[opencode]", `Creating session with title: ${sessionTitle}`);
    try {
      const sessionResult = (await withTimeout(
        client.session.create({
          body: {
            title: sessionTitle,
            directory: repoPath,
          },
        }),
        env.OPENCODE_FETCH_TIMEOUT_MS,
        `Session creation timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
      )) as { error?: { message?: string }; data?: { id: string } };

      if (sessionResult.error || !sessionResult.data) {
        const errorDetails = sessionResult.error
          ? JSON.stringify(sessionResult.error, null, 2)
          : "No error object provided";
        logger.error("[opencode]", `Session creation failed. Error details:`, errorDetails);
        throw new Error(
          `Failed to create opencode session: ${sessionResult.error?.message || JSON.stringify(sessionResult.error) || "Unknown error"}`,
        );
      }

      currentSessionId = sessionResult.data.id;
      logger.log("[opencode]", `Session created successfully: ${currentSessionId}`);

      // Send agent prompt as system message for new sessions
      const configPath = env.OPENCODE_CONFIG_PATH;
      const opencodeConfig = await readOpencodeConfig(configPath);
      let agentPrompt: string | undefined;

      if (opencodeConfig.agent && typeof opencodeConfig.agent === "object") {
        const defaultAgent = (opencodeConfig.agent as Record<string, unknown>).default;
        if (defaultAgent && typeof defaultAgent === "object" && typeof (defaultAgent as { prompt?: string }).prompt === "string") {
          agentPrompt = (defaultAgent as { prompt: string }).prompt;
        }
      } else if (opencodeConfig.agent && typeof opencodeConfig.agent === "string") {
        agentPrompt = opencodeConfig.agent;
      }

      if (!agentPrompt) {
        const dataDir = dirname(env.PACKAGES_DIR) || "/data";
        const globalConfig = await readGlobalConfig(dataDir);
        agentPrompt = globalConfig.default_agent_prompt || DEFAULT_AGENT_PROMPT;
      }

      let promptWithDirectory = `${agentPrompt}\n\nIMPORTANT: The repository you are analyzing is located at: ${repoPath}\nWhen executing shell commands, you should change to this directory first using 'cd ${repoPath}' before running any commands.`;
      if ((kctxHelper ?? "").trim() !== "") {
        promptWithDirectory = `Repository summary (for context):\n\n${kctxHelper}\n\n---\n\n${promptWithDirectory}`;
      }

      if (agentPrompt) {
        logger.log("[opencode]", `Sending agent prompt to new session`);
        try {
          await withTimeout(
            client.session.prompt({
              path: { id: currentSessionId },
              body: {
                noReply: true,
                parts: [{ type: "text", text: promptWithDirectory }],
              },
            }),
            env.OPENCODE_FETCH_TIMEOUT_MS,
            `Agent prompt send timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
          );
          logger.log("[opencode]", `Agent prompt sent successfully`);
        } catch (error) {
          logger.error("[opencode]", `Error sending agent prompt:`, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      logger.error("[opencode]", `Error during session creation:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  } else {
    logger.log("[opencode]", `Reusing existing session: ${currentSessionId}`);
  }

  try {
    const events = (await withTimeout(
      client.event.subscribe(),
      env.OPENCODE_FETCH_TIMEOUT_MS,
      `Event subscription timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
    )) as { stream: AsyncIterable<{ type: string; properties?: { info?: unknown; part?: unknown; error?: unknown } }> };
    const eventStream = events.stream;

    const promptBody: { parts: Array<{ type: string; text: string }>; model?: OpencodeModel } = {
      parts: [{ type: "text", text: query }],
    };
    if (model) {
      promptBody.model = model;
    }

    logger.log("[opencode]", `Sending prompt message to session ${currentSessionId}`);
    void (client.session.prompt as (opts: unknown) => Promise<unknown>)({
      path: { id: currentSessionId },
      body: promptBody,
    }).catch((error: unknown) => {
      logger.error("[opencode]", `Prompt send error:`, error);
    });

    let accumulatedText = "";
    let accumulatedThinking: string[] = [];
    let lastFullThinkingText = "";
    let assistantMessageId: string | null = null;
    let streamComplete = false;
    let waitingForAssistant = true;
    let lastEventTime = Date.now();
    const heartbeatTimeoutMs = env.OPENCODE_STREAM_HEARTBEAT_MS;

    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let heartbeatError: Error | null = null;

    const setupHeartbeat = () => {
      heartbeatInterval = setInterval(() => {
        const timeSinceLastEvent = Date.now() - lastEventTime;
        if (timeSinceLastEvent > heartbeatTimeoutMs) {
          heartbeatError = new Error(
            `Event stream appears to have stopped: no events received for ${heartbeatTimeoutMs}ms`,
          );
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, heartbeatTimeoutMs / 2);
    };

    setupHeartbeat();

    const streamStartTime = Date.now();
    const overallTimeoutMs = env.OPENCODE_TIMEOUT_MS;

    try {
      for await (const event of eventStream) {
        logger.log("[opencode]", `Event type: ${event.type}`, {
          type: event.type,
          hasProperties: !!event.properties,
        });

        const elapsed = Date.now() - streamStartTime;
        if (elapsed > overallTimeoutMs) {
          throw new Error(`Stream processing timed out after ${overallTimeoutMs}ms`);
        }

        if (heartbeatError) {
          throw heartbeatError;
        }

        lastEventTime = Date.now();

        if (event.type === "message.updated") {
          const messageInfo = event.properties?.info as { sessionID?: string; role?: string; id?: string } | undefined;
          if (
            messageInfo &&
            messageInfo.sessionID === currentSessionId &&
            messageInfo.role === "assistant"
          ) {
            assistantMessageId = messageInfo.id ?? null;
            waitingForAssistant = false;
            logger.log("[opencode]", `Found assistant message: ${assistantMessageId}`);
          }
        }

        if (event.type === "message.part.updated") {
          const part = event.properties?.part as {
            sessionID?: string;
            messageID?: string;
            type?: string;
            text?: string;
            time?: { end?: unknown };
            messageInfo?: { role?: string };
            tool?: string;
            name?: string;
            state?: { status?: string; input?: { filePath?: string } };
            metadata?: { openrouter?: { reasoning_details?: Array<{ text?: string }> } };
            path?: string;
          };

          if (!part) continue;
          if (part.sessionID !== currentSessionId) continue;

          if (part.type === "reasoning" && typeof part.text === "string") {
            if (waitingForAssistant && part.messageID) {
              assistantMessageId = part.messageID;
              waitingForAssistant = false;
              logger.log("[opencode]", `Found assistant message from reasoning part: ${assistantMessageId}`);
            }
            if (lastFullThinkingText && part.text.startsWith(lastFullThinkingText)) {
              if (accumulatedThinking.length > 0) {
                accumulatedThinking[accumulatedThinking.length - 1] = part.text;
              } else {
                accumulatedThinking.push(part.text);
              }
              lastFullThinkingText = part.text;
            } else if (accumulatedThinking.length > 0 && accumulatedThinking[accumulatedThinking.length - 1] === part.text) {
              lastFullThinkingText = part.text;
            } else if (accumulatedThinking.some((t) => t === part.text)) {
              lastFullThinkingText = part.text ?? "";
            } else {
              accumulatedThinking.push(part.text);
              lastFullThinkingText = part.text;
            }
            const thinkingText = accumulatedThinking.join("\n\n");
            yield { text: "", done: false, sessionId: currentSessionId, thinking: thinkingText };
            continue;
          }

          if (waitingForAssistant && part.messageID) {
            if (part.messageInfo) {
              if (part.messageInfo.role === "assistant") {
                assistantMessageId = part.messageID;
                waitingForAssistant = false;
                logger.log("[opencode]", `Found assistant message from part: ${assistantMessageId}`);
              } else if (part.messageInfo.role === "user") {
                continue;
              }
            }
            if (waitingForAssistant && (part.type === "tool" || part.type === "reasoning")) {
              assistantMessageId = part.messageID;
              waitingForAssistant = false;
              logger.log("[opencode]", `Found assistant message from first response part: ${assistantMessageId}`);
            }
          }

          if (!assistantMessageId || part.messageID !== assistantMessageId) {
            continue;
          }

          logger.log("[opencode]", `Part type: ${part.type}`, {
            type: part.type,
            hasText: typeof part.text === "string",
            hasMetadata: !!part.metadata,
            partKeys: Object.keys(part),
          });

          if (part.type === "text" && typeof part.text === "string") {
            if (part.text.length > accumulatedText.length) {
              const newText = part.text.slice(accumulatedText.length);
              accumulatedText = part.text;
              const thinkingText = accumulatedThinking.length > 0 ? accumulatedThinking.join("\n\n") : undefined;
              yield { text: newText, done: false, sessionId: currentSessionId, thinking: thinkingText };
            } else {
              accumulatedText = part.text;
            }

            // Do not yield done on part.time?.end — there may be more assistant messages (e.g. after tool use).
            // Turn completion is signaled by session.idle below.
          } else if (part.type && part.type !== "text" && part.type !== "reasoning") {
            const toolName = part.tool || part.name || "unknown";
            const toolState = part.state;
            if (toolState?.status === "running") {
              const toolInfo = toolState?.input?.filePath
                ? `🔧 Tool: ${toolName} (running)\n   Reading: ${toolState.input.filePath}`
                : `🔧 Tool: ${toolName} (running)`;
              accumulatedThinking.push(toolInfo);
            } else if (toolState?.status === "completed") {
              const toolInfo = toolState?.input?.filePath
                ? `✅ Tool: ${toolName} (completed)\n   Read: ${toolState.input.filePath}`
                : `✅ Tool: ${toolName} (completed)`;
              accumulatedThinking.push(toolInfo);
            }
            const meta = part.metadata;
            if (meta?.openrouter?.reasoning_details && Array.isArray(meta.openrouter.reasoning_details)) {
              for (const d of meta.openrouter.reasoning_details) {
                if (d?.text && typeof d.text === "string" && !accumulatedThinking.includes(d.text)) {
                  accumulatedThinking.push(d.text);
                }
              }
            }
            const thinkingText = accumulatedThinking.join("\n\n");
            yield { text: "", done: false, sessionId: currentSessionId, thinking: thinkingText };
          } else if (part.type === "file" || part.type === "file_search") {
            const fileInfo = `📁 File operation: ${part.path || "unknown"}`;
            accumulatedThinking.push(fileInfo);
            const thinkingText = accumulatedThinking.join("\n\n");
            yield { text: "", done: false, sessionId: currentSessionId, thinking: thinkingText };
          }
        }

        if (event.type === "session.error" || event.type === "message.error") {
          const error = event.properties?.error;
          throw new Error(
            `Opencode error: ${error && typeof error === "object" && "message" in error ? String((error as { message?: string }).message) : JSON.stringify(error) || "Unknown error"}`,
          );
        }

        if (event.type === "session.idle") {
          const sessionIdFromEvent = (event.properties as { sessionID?: string })?.sessionID;
          if (sessionIdFromEvent === currentSessionId && !streamComplete) {
            streamComplete = true;
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            const thinkingText = accumulatedThinking.length > 0 ? accumulatedThinking.join("\n\n") : undefined;
            yield { text: "", done: true, sessionId: currentSessionId, thinking: thinkingText };
            return;
          }
        }
      }

      if (accumulatedText && !streamComplete) {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        const thinkingText = accumulatedThinking.length > 0 ? accumulatedThinking.join("\n\n") : undefined;
        yield { text: "", done: true, sessionId: currentSessionId, thinking: thinkingText };
      }
    } finally {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    }
  } catch (error) {
    logger.error(
      "[opencode]",
      `Error in queryOpencodeStream:`,
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      logger.error("[opencode]", `Error stack:`, error.stack);
    }
    throw error;
  }
}

export async function queryOpencode(
  repoPath: string,
  query: string,
  sessionId?: string,
  timeoutMs?: number,
  kctxHelper?: string,
): Promise<{ response: string; sessionId: string }> {
  const ms = timeoutMs ?? env.OPENCODE_TIMEOUT_MS;
  return withTimeout(
    queryOpencodeInternal(repoPath, query, sessionId, kctxHelper),
    ms,
    `OpenCode query timed out after ${ms}ms`,
  );
}

async function queryOpencodeInternal(
  repoPath: string,
  query: string,
  sessionId?: string,
  kctxHelper?: string,
): Promise<{ response: string; sessionId: string }> {
  logger.log("[opencode]", `Starting query for directory: ${repoPath}`);
  logger.log("[opencode]", `Query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`);

  const opencodeUrl = getOpencodeUrl();
  logger.log("[opencode]", `Server URL: ${opencodeUrl}`);

  let createOpencodeClient: (opts: { baseUrl: string; directory: string }) => unknown;
  try {
    const module = await import("@opencode-ai/sdk");
    createOpencodeClient = module.createOpencodeClient as typeof createOpencodeClient;
    logger.log("[opencode]", "Using client from @opencode-ai/sdk package");
  } catch {
    logger.log("[opencode]", "Falling back to local context client");
    const opencodePath = join(
      process.cwd(),
      "context",
      "opencode",
      "packages",
      "sdk",
      "js",
      "src",
      "index.ts",
    );
    const module = await import(opencodePath);
    createOpencodeClient = module.createOpencodeClient as typeof createOpencodeClient;
  }

  logger.log("[opencode]", `Creating client with baseUrl: ${opencodeUrl}, directory: ${repoPath}`);
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: repoPath,
  }) as {
    session: { create: (opts: unknown) => Promise<unknown>; prompt: (opts: unknown) => Promise<unknown> };
  };

  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const sessionTitle = `Query: ${query.substring(0, 50)}`;
    logger.log("[opencode]", `Creating session with title: ${sessionTitle}`);
    try {
      const sessionResult = (await withTimeout(
        client.session.create({
          body: { title: sessionTitle, directory: repoPath },
        }),
        env.OPENCODE_FETCH_TIMEOUT_MS,
        `Session creation timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
      )) as { error?: { message?: string }; data?: { id: string } };

      if (sessionResult.error || !sessionResult.data) {
        const errorDetails = sessionResult.error
          ? JSON.stringify(sessionResult.error, null, 2)
          : "No error object provided";
        logger.error("[opencode]", `Session creation failed. Error details:`, errorDetails);
        throw new Error(
          `Failed to create opencode session: ${sessionResult.error?.message || JSON.stringify(sessionResult.error) || "Unknown error"}`,
        );
      }

      currentSessionId = sessionResult.data.id;
      logger.log("[opencode]", `Session created successfully: ${currentSessionId}`);

      const configPath = env.OPENCODE_CONFIG_PATH;
      const opencodeConfig = await readOpencodeConfig(configPath);
      let agentPrompt: string | undefined;

      if (opencodeConfig.agent && typeof opencodeConfig.agent === "object") {
        const defaultAgent = (opencodeConfig.agent as Record<string, unknown>).default;
        if (defaultAgent && typeof defaultAgent === "object" && typeof (defaultAgent as { prompt?: string }).prompt === "string") {
          agentPrompt = (defaultAgent as { prompt: string }).prompt;
        }
      } else if (opencodeConfig.agent && typeof opencodeConfig.agent === "string") {
        agentPrompt = opencodeConfig.agent;
      }

      if (!agentPrompt) {
        const dataDir = dirname(env.PACKAGES_DIR) || "/data";
        const globalConfig = await readGlobalConfig(dataDir);
        agentPrompt = globalConfig.default_agent_prompt || DEFAULT_AGENT_PROMPT;
      }

      let promptWithDirectory = `${agentPrompt}\n\nIMPORTANT: The repository you are analyzing is located at: ${repoPath}\nWhen executing shell commands, you should change to this directory first using 'cd ${repoPath}' before running any commands.`;
      if ((kctxHelper ?? "").trim() !== "") {
        promptWithDirectory = `Repository summary (for context):\n\n${kctxHelper}\n\n---\n\n${promptWithDirectory}`;
      }

      if (agentPrompt) {
        logger.log("[opencode]", `Sending agent prompt to new session`);
        try {
          await withTimeout(
            client.session.prompt({
              path: { id: currentSessionId },
              body: { noReply: true, parts: [{ type: "text", text: promptWithDirectory }] },
            }),
            env.OPENCODE_FETCH_TIMEOUT_MS,
            `Agent prompt send timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
          );
          logger.log("[opencode]", `Agent prompt sent successfully`);
        } catch (error) {
          logger.error("[opencode]", `Error sending agent prompt:`, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[opencode]", `Error during session creation (opencode URL: ${opencodeUrl}):`, errorMessage);
      throw new Error(
        `Failed to create opencode session (opencode URL: ${opencodeUrl}): ${errorMessage}`,
      );
    }
  } else {
    logger.log("[opencode]", `Reusing existing session: ${currentSessionId}`);
  }

  try {
    logger.log("[opencode]", `Sending prompt message to session ${currentSessionId}`);
    let promptResult: { error?: { message?: string }; data?: { parts?: Array<{ type?: string; text?: string }> } };
    try {
      promptResult = (await withTimeout(
        client.session.prompt({
          path: { id: currentSessionId },
          body: { parts: [{ type: "text", text: query }] },
        }),
        env.OPENCODE_FETCH_TIMEOUT_MS,
        `Prompt send timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
      )) as typeof promptResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[opencode]", `Error during prompt send (opencode URL: ${opencodeUrl}, session: ${currentSessionId}):`, errorMessage);
      throw new Error(
        `Failed to send prompt to opencode (opencode URL: ${opencodeUrl}): ${errorMessage}`,
      );
    }

    if (promptResult.error) {
      throw new Error(
        `Failed to send prompt: ${promptResult.error?.message || JSON.stringify(promptResult.error) || "Unknown error"}`,
      );
    }

    if (promptResult.data?.parts && Array.isArray(promptResult.data.parts) && promptResult.data.parts.length > 0) {
      const textParts = promptResult.data.parts.filter(
        (p): p is { type: "text"; text: string } =>
          !!p && typeof p === "object" && p.type === "text" && typeof p.text === "string",
      );
      if (textParts.length > 0) {
        const lastTextPart = textParts[textParts.length - 1];
        logger.log("[opencode]", `Received immediate response (${lastTextPart.text.length} characters)`);
        return { response: lastTextPart.text, sessionId: currentSessionId };
      }
    }

    logger.log("[opencode]", `No immediate response, polling for messages...`);

    if (!repoPath) {
      throw new Error(`Cannot fetch messages: no repository path available`);
    }

    const assistantMessage = (await pollForMessages(
      opencodeUrl,
      currentSessionId,
      repoPath,
      env.OPENCODE_FETCH_TIMEOUT_MS,
      env.OPENCODE_POLL_INTERVAL_MS,
      env.OPENCODE_MAX_POLL_ATTEMPTS,
    )) as { parts?: Array<{ type?: string; text?: string }> };

    if (!assistantMessage.parts || !Array.isArray(assistantMessage.parts) || assistantMessage.parts.length === 0) {
      throw new Error(`Assistant message has no parts`);
    }

    const textParts = assistantMessage.parts.filter(
      (p): p is { type: "text"; text: string } =>
        !!p && typeof p === "object" && p.type === "text" && typeof p.text === "string",
    );

    if (textParts.length === 0) {
      throw new Error(`Assistant message has no text parts`);
    }

    const lastTextPart = textParts[textParts.length - 1];
    const responseText = lastTextPart.text;
    logger.log("[opencode]", `Received response from polling (${responseText.length} characters)`);
    return { response: responseText, sessionId: currentSessionId };
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("opencode URL:"))) {
      logger.error("[opencode]", `Error in queryOpencode (opencode URL: ${opencodeUrl}):`, error instanceof Error ? error.message : String(error));
    }
    throw error;
  }
}

/**
 * If the package has no kctx_helper, ask OpenCode for a repo summary and write it to the package config.
 * Intended to be called fire-and-forget after responding to a fresh-session query_dependency.
 * Uses 3x default timeout. Logs errors; does not throw.
 */
export async function generateKctxHelperIfNeeded(
  packagesDir: string,
  identifier: string,
  repoPath: string,
): Promise<void> {
  try {
    const config = await readPackageConfig(packagesDir, identifier, true);
    if (!config) {
      logger.log("[opencode]", `generateKctxHelperIfNeeded: package not found ${identifier}`);
      return;
    }
    if ((config.kctx_helper ?? "").trim() !== "") {
      return;
    }
    const timeoutMs = env.OPENCODE_TIMEOUT_MS * 3;
    logger.log("[opencode]", `Generating kctx_helper for ${identifier} (timeout ${timeoutMs}ms)`);
    const result = await queryOpencode(
      repoPath,
      KCTX_HELPER_SUMMARY_PROMPT,
      undefined,
      timeoutMs,
      undefined,
    );
    const updated = await readPackageConfig(packagesDir, identifier, true);
    if (!updated) {
      logger.log("[opencode]", `generateKctxHelperIfNeeded: package gone ${identifier}`);
      return;
    }
    await writePackageConfig(packagesDir, { ...updated, kctx_helper: result.response });
    logger.log("[opencode]", `Saved kctx_helper for ${identifier}`);
  } catch (error) {
    logger.error(
      "[opencode]",
      `generateKctxHelperIfNeeded failed for ${identifier}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}
