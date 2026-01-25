import { join, dirname } from "node:path";
import { env } from "@kinetic-context/env/server";
import { logger } from "./logger.js";
import { readGlobalConfig, readOpencodeConfig } from "./config.js";

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
): Promise<any> {
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

      const messagesData = await response.json();

      if (!Array.isArray(messagesData)) {
        throw new Error(
          `Invalid messages response: expected array, got ${typeof messagesData}`,
        );
      }

      const assistantMessage = messagesData.find(
        (msg: any) => msg.info && msg.info.role === "assistant",
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

IMPORTANT: The working directory for this session is set to the repository root. When executing shell commands, you should operate from this directory. If you need to change directories, use 'cd' to navigate, but remember that the repository root is your base working directory.`;

export interface OpencodeModel {
  providerID: string;
  modelID: string;
}

export async function* queryOpencodeStream(
  repoPath: string,
  query: string,
  model?: OpencodeModel,
  sessionId?: string,
): AsyncGenerator<{ text: string; done: boolean; sessionId?: string }, void, unknown> {
  logger.log("[opencode]", `Starting streaming query for directory: ${repoPath}`);
  logger.log("[opencode]", `Query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`);
  if (model) {
    logger.log("[opencode]", `Using model: ${model.providerID}/${model.modelID}`);
  }
  
  const opencodeUrl = getOpencodeUrl();
  logger.log("[opencode]", `Server URL: ${opencodeUrl}`);

  // Create client with the repository directory
  let createOpencodeClient: any;
  try {
    const module = await import("@opencode-ai/sdk");
    createOpencodeClient = module.createOpencodeClient;
    logger.log("[opencode]", "Using client from @opencode-ai/sdk package");
  } catch (error) {
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
    createOpencodeClient = module.createOpencodeClient;
  }

  logger.log("[opencode]", `Creating client with baseUrl: ${opencodeUrl}, directory: ${repoPath}`);
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: repoPath,
  });

  // Create or reuse session
  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const sessionTitle = `Query: ${query.substring(0, 50)}`;
    logger.log("[opencode]", `Creating session with title: ${sessionTitle}`);
    try {
      const sessionResult = await withTimeout(
        client.session.create({
          body: { 
            title: sessionTitle,
            directory: repoPath, // Set the working directory for this session
          },
        }),
        env.OPENCODE_FETCH_TIMEOUT_MS,
        `Session creation timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
      );

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
      // First try to get from opencode.json agent config, then fall back to global config
      const configPath = env.OPENCODE_CONFIG_PATH;
      const opencodeConfig = await readOpencodeConfig(configPath);
      let agentPrompt: string | undefined;
      
      // Check for agent config in opencode.json (new format)
      if (opencodeConfig.agent && typeof opencodeConfig.agent === "object") {
        // Try to get prompt from default agent
        const defaultAgent = (opencodeConfig.agent as any).default;
        if (defaultAgent && typeof defaultAgent === "object" && typeof defaultAgent.prompt === "string") {
          agentPrompt = defaultAgent.prompt;
        }
        // Fallback: check if agent is a string (legacy format)
      } else if (opencodeConfig.agent && typeof opencodeConfig.agent === "string") {
        agentPrompt = opencodeConfig.agent;
      }
      
      // If no prompt found in opencode config, fall back to global config
      if (!agentPrompt) {
        const dataDir = dirname(env.PACKAGES_DIR) || "/data";
        const globalConfig = await readGlobalConfig(dataDir);
        agentPrompt = globalConfig.default_agent_prompt || DEFAULT_AGENT_PROMPT;
      }
      
      // Append working directory information to the prompt
      const promptWithDirectory = `${agentPrompt}\n\nIMPORTANT: The repository you are analyzing is located at: ${repoPath}\nWhen executing shell commands, you should change to this directory first using 'cd ${repoPath}' before running any commands.`;
      
      if (agentPrompt) {
        logger.log("[opencode]", `Sending agent prompt to new session`);
        try {
          await withTimeout(
            client.session.prompt({
              path: { id: currentSessionId },
              body: {
                noReply: true,
                parts: [
                  {
                    type: "text",
                    text: promptWithDirectory,
                  },
                ],
              },
            }),
            env.OPENCODE_FETCH_TIMEOUT_MS,
            `Agent prompt send timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
          );
          logger.log("[opencode]", `Agent prompt sent successfully`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("[opencode]", `Error sending agent prompt:`, errorMessage);
          // Don't throw - continue with the query even if prompt fails
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[opencode]", `Error during session creation:`, errorMessage);
      throw error;
    }
  } else {
    logger.log("[opencode]", `Reusing existing session: ${currentSessionId}`);
  }

  try {
    // Subscribe to events before sending prompt
    const events = await withTimeout(
      client.event.subscribe(),
      env.OPENCODE_FETCH_TIMEOUT_MS,
      `Event subscription timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
    );
    const eventStream = events.stream;

    // Send prompt with optional model
    const promptBody: any = {
      parts: [
        {
          type: "text",
          text: query,
        },
      ],
    };

    if (model) {
      promptBody.model = {
        providerID: model.providerID,
        modelID: model.modelID,
      };
    }

    logger.log("[opencode]", `Sending prompt message to session ${currentSessionId}`);
    void client.session.prompt({
      path: { id: currentSessionId },
      body: promptBody,
    }).catch((error: any) => {
      logger.error("[opencode]", `Prompt send error:`, error);
    });

    // Process events and yield text chunks
    let accumulatedText = "";
    let assistantMessageId: string | null = null;
    let streamComplete = false;
    let waitingForAssistant = true;
    let lastEventTime = Date.now();
    const heartbeatTimeoutMs = env.OPENCODE_STREAM_HEARTBEAT_MS;

    // Set up heartbeat check to detect when stream stops sending events
    let heartbeatInterval: NodeJS.Timeout | null = null;
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
      }, heartbeatTimeoutMs / 2); // Check at half the timeout interval
    };

    setupHeartbeat();

    // Set up overall timeout for the stream processing
    const streamStartTime = Date.now();
    const overallTimeoutMs = env.OPENCODE_TIMEOUT_MS;

    try {
      for await (const event of eventStream) {
        // Check for overall timeout
        const elapsed = Date.now() - streamStartTime;
        if (elapsed > overallTimeoutMs) {
          throw new Error(
            `Stream processing timed out after ${overallTimeoutMs}ms`,
          );
        }

        // Check for heartbeat error
        if (heartbeatError) {
          throw heartbeatError;
        }

        lastEventTime = Date.now(); // Update on each event

        // Track the first assistant message that comes after we send the prompt
        if (event.type === "message.updated" && waitingForAssistant) {
          const messageInfo = (event as any).properties.info;
          if (
            messageInfo &&
            messageInfo.sessionID === currentSessionId &&
            messageInfo.role === "assistant"
          ) {
            assistantMessageId = messageInfo.id;
            waitingForAssistant = false;
            logger.log("[opencode]", `Found assistant message: ${assistantMessageId}`);
          }
        }

        if (event.type === "message.part.updated") {
          const part = (event as any).properties.part;

          // Only process events for our session
          if (part.sessionID !== currentSessionId) continue;

          // If we're still waiting for the assistant message, check if this part tells us
          if (waitingForAssistant && part.messageID) {
            // Check if part has embedded message info
            if (part.messageInfo) {
              if (part.messageInfo.role === "assistant") {
                assistantMessageId = part.messageID;
                waitingForAssistant = false;
                logger.log("[opencode]", `Found assistant message from part: ${assistantMessageId}`);
              } else if (part.messageInfo.role === "user") {
                // Skip user message parts
                continue;
              }
            }
          }

          // Only process parts from the assistant message we're tracking
          if (!assistantMessageId || part.messageID !== assistantMessageId) {
            continue;
          }

          // Extract text from text parts
          if (part.type === "text" && typeof part.text === "string") {
            // Yield incremental text
            if (part.text.length > accumulatedText.length) {
              const newText = part.text.slice(accumulatedText.length);
              accumulatedText = part.text;
              yield { text: newText, done: false, sessionId: currentSessionId };
            } else {
              accumulatedText = part.text;
            }

            // If the part has an end time, it's complete
            if (part.time?.end) {
              streamComplete = true;
              if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
              }
              yield { text: "", done: true, sessionId: currentSessionId };
              return;
            }
          }
        }

        // Check for session errors
        if (event.type === "session.error" || event.type === "message.error") {
          const error = (event as any).properties.error;
          throw new Error(
            `Opencode error: ${error?.message || JSON.stringify(error) || "Unknown error"}`,
          );
        }

        // Check if the message is complete (session updated might indicate completion)
        if (event.type === "session.updated") {
          const sessionInfo = (event as any).properties.info;
          if (sessionInfo.id === currentSessionId && !streamComplete) {
            // Give it a moment for final updates, then check if we have text
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (accumulatedText && !streamComplete) {
              streamComplete = true;
              if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
              }
              yield { text: "", done: true, sessionId: currentSessionId };
              return;
            }
          }
        }
      }

      // If we exit the loop, yield completion if we have text
      if (accumulatedText && !streamComplete) {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        yield { text: "", done: true, sessionId: currentSessionId };
      }
    } finally {
      // Clean up heartbeat interval
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
): Promise<{ response: string; sessionId: string }> {
  // Wrap entire function with timeout
  return withTimeout(
    queryOpencodeInternal(repoPath, query, sessionId),
    env.OPENCODE_TIMEOUT_MS,
    `OpenCode query timed out after ${env.OPENCODE_TIMEOUT_MS}ms`,
  );
}

async function queryOpencodeInternal(
  repoPath: string,
  query: string,
  sessionId?: string,
): Promise<{ response: string; sessionId: string }> {
  logger.log("[opencode]", `Starting query for directory: ${repoPath}`);
  logger.log("[opencode]", `Query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`);

  const opencodeUrl = getOpencodeUrl();
  logger.log("[opencode]", `Server URL: ${opencodeUrl}`);

  // Create client with the repository directory
  // Try to use installed package first (for production/Docker)
  let createOpencodeClient: any;
  try {
    const module = await import("@opencode-ai/sdk");
    createOpencodeClient = module.createOpencodeClient;
    logger.log("[opencode]", "Using client from @opencode-ai/sdk package");
  } catch (error) {
    logger.log("[opencode]", "Falling back to local context client");
    // Fallback: try to use local opencode from context directory (for development)
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
    createOpencodeClient = module.createOpencodeClient;
  }

  logger.log("[opencode]", `Creating client with baseUrl: ${opencodeUrl}, directory: ${repoPath}`);
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: repoPath,
  });

  // Create or reuse session
  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const sessionTitle = `Query: ${query.substring(0, 50)}`;
    logger.log("[opencode]", `Creating session with title: ${sessionTitle}`);
    try {
      const sessionResult = await withTimeout(
        client.session.create({
          body: { 
            title: sessionTitle,
            directory: repoPath, // Set the working directory for this session
          },
        }),
        env.OPENCODE_FETCH_TIMEOUT_MS,
        `Session creation timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
      );

      logger.log("[opencode]", `Session create result:`, {
        hasError: !!sessionResult.error,
        hasData: !!sessionResult.data,
        error: sessionResult.error ? JSON.stringify(sessionResult.error, null, 2) : null,
        dataId: sessionResult.data?.id,
      });

      if (sessionResult.error || !sessionResult.data) {
        const errorDetails = sessionResult.error 
          ? JSON.stringify(sessionResult.error, null, 2)
          : "No error object provided";
        logger.error("[opencode]", `Session creation failed. Error details:`, errorDetails);
        logger.error("[opencode]", `Full session result:`, JSON.stringify(sessionResult, null, 2));
        throw new Error(
          `Failed to create opencode session: ${sessionResult.error?.message || JSON.stringify(sessionResult.error) || "Unknown error"}`,
        );
      }

      currentSessionId = sessionResult.data.id;
      logger.log("[opencode]", `Session created successfully: ${currentSessionId}`);
      logger.log("[opencode]", `Session ID type: ${typeof currentSessionId}, starts with 'ses': ${String(currentSessionId).startsWith('ses')}`);
      
      // Send agent prompt as system message for new sessions
      // First try to get from opencode.json agent config, then fall back to global config
      const configPath = env.OPENCODE_CONFIG_PATH;
      const opencodeConfig = await readOpencodeConfig(configPath);
      let agentPrompt: string | undefined;
      
      // Check for agent config in opencode.json (new format)
      if (opencodeConfig.agent && typeof opencodeConfig.agent === "object") {
        // Try to get prompt from default agent
        const defaultAgent = (opencodeConfig.agent as any).default;
        if (defaultAgent && typeof defaultAgent === "object" && typeof defaultAgent.prompt === "string") {
          agentPrompt = defaultAgent.prompt;
        }
        // Fallback: check if agent is a string (legacy format)
      } else if (opencodeConfig.agent && typeof opencodeConfig.agent === "string") {
        agentPrompt = opencodeConfig.agent;
      }
      
      // If no prompt found in opencode config, fall back to global config
      if (!agentPrompt) {
        const dataDir = dirname(env.PACKAGES_DIR) || "/data";
        const globalConfig = await readGlobalConfig(dataDir);
        agentPrompt = globalConfig.default_agent_prompt || DEFAULT_AGENT_PROMPT;
      }
      
      // Append working directory information to the prompt
      const promptWithDirectory = `${agentPrompt}\n\nIMPORTANT: The repository you are analyzing is located at: ${repoPath}\nWhen executing shell commands, you should change to this directory first using 'cd ${repoPath}' before running any commands.`;
      
      if (agentPrompt) {
        logger.log("[opencode]", `Sending agent prompt to new session`);
        try {
          await withTimeout(
            client.session.prompt({
              path: { id: currentSessionId },
              body: {
                noReply: true,
                parts: [
                  {
                    type: "text",
                    text: promptWithDirectory,
                  },
                ],
              },
            }),
            env.OPENCODE_FETCH_TIMEOUT_MS,
            `Agent prompt send timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
          );
          logger.log("[opencode]", `Agent prompt sent successfully`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("[opencode]", `Error sending agent prompt:`, errorMessage);
          // Don't throw - continue with the query even if prompt fails
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error && error.stack ? error.stack : undefined;
      logger.error("[opencode]", `Error during session creation (opencode URL: ${opencodeUrl}):`, errorMessage);
      if (errorStack) {
        logger.error("[opencode]", `Error stack:`, errorStack);
      }
      throw new Error(
        `Failed to create opencode session (opencode URL: ${opencodeUrl}): ${errorMessage}`,
      );
    }
  } else {
    logger.log("[opencode]", `Reusing existing session: ${currentSessionId}`);
  }

  try {
    // Use prompt to send the message (streaming endpoint)
    logger.log("[opencode]", `Sending prompt message to session ${currentSessionId}`);
    let promptResult;
    try {
      promptResult = await withTimeout(
        client.session.prompt({
          path: { id: currentSessionId },
          body: {
            parts: [
              {
                type: "text",
                text: query,
              },
            ],
          },
        }),
        env.OPENCODE_FETCH_TIMEOUT_MS,
        `Prompt send timed out after ${env.OPENCODE_FETCH_TIMEOUT_MS}ms`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error && error.stack ? error.stack : undefined;
      logger.error("[opencode]", `Error during prompt send (opencode URL: ${opencodeUrl}, session: ${currentSessionId}):`, errorMessage);
      if (errorStack) {
        logger.error("[opencode]", `Error stack:`, errorStack);
      }
      throw new Error(
        `Failed to send prompt to opencode (opencode URL: ${opencodeUrl}): ${errorMessage}`,
      );
    }

    // Log prompt result for debugging
    logger.log("[opencode]", `Prompt result:`, {
      hasError: !!promptResult.error,
      hasData: !!promptResult.data,
      error: promptResult.error ? JSON.stringify(promptResult.error, null, 2) : null,
      dataKeys: promptResult.data ? Object.keys(promptResult.data) : null,
      hasParts: !!promptResult.data?.parts,
      partsCount: Array.isArray(promptResult.data?.parts) ? promptResult.data.parts.length : 0,
      fullData: promptResult.data ? JSON.stringify(promptResult.data, null, 2) : null,
    });

    if (promptResult.error) {
      const errorDetails = JSON.stringify(promptResult.error, null, 2);
      logger.error("[opencode]", `Prompt failed. Error details:`, errorDetails);
      throw new Error(
        `Failed to send prompt: ${promptResult.error?.message || JSON.stringify(promptResult.error) || "Unknown error"}`,
      );
    }

    // Since prompt is streaming, it may return empty initially
    // Wait and poll by fetching the message directly using HTTP to bypass SDK bug
    if (promptResult.data?.parts && Array.isArray(promptResult.data.parts) && promptResult.data.parts.length > 0) {
      // We got a response immediately
      const textParts = promptResult.data.parts.filter(
        (p: any) => p && typeof p === "object" && p.type === "text" && typeof p.text === "string"
      );

      if (textParts.length > 0) {
        const lastTextPart = textParts[textParts.length - 1];
        const responseText = lastTextPart.text;
        logger.log("[opencode]", `Received immediate response (${responseText.length} characters)`);
        return { response: responseText, sessionId: currentSessionId };
      }
    }

    // If we didn't get a response immediately, poll for messages with timeout
    logger.log("[opencode]", `No immediate response, polling for messages...`);
    
    if (!repoPath) {
      throw new Error(`Cannot fetch messages: no repository path available`);
    }

    // Poll for messages with timeout and retry logic
    const assistantMessage = await pollForMessages(
      opencodeUrl,
      currentSessionId,
      repoPath,
      env.OPENCODE_FETCH_TIMEOUT_MS,
      env.OPENCODE_POLL_INTERVAL_MS,
      env.OPENCODE_MAX_POLL_ATTEMPTS,
    );

    if (!assistantMessage.parts || !Array.isArray(assistantMessage.parts) || assistantMessage.parts.length === 0) {
      throw new Error(`Assistant message has no parts`);
    }

    // Extract text parts
    const textParts = assistantMessage.parts.filter(
      (p: any) => p && typeof p === "object" && p.type === "text" && typeof p.text === "string"
    );

    if (textParts.length === 0) {
      throw new Error(`Assistant message has no text parts`);
    }

    const lastTextPart = textParts[textParts.length - 1];
    const responseText = lastTextPart.text;
    logger.log("[opencode]", `Received response from polling (${responseText.length} characters)`);
    return { response: responseText, sessionId: currentSessionId };
  } catch (error) {
    // Only log if error wasn't already logged with context above
    if (!(error instanceof Error && error.message.includes('opencode URL:'))) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error && error.stack ? error.stack : undefined;
      logger.error("[opencode]", `Error in queryOpencode (opencode URL: ${opencodeUrl}):`, errorMessage);
      if (errorStack) {
        logger.error("[opencode]", `Error stack:`, errorStack);
      }
    }
    throw error;
  }
}