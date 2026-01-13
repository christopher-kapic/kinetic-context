import { join } from "node:path";
import { env } from "@kinetic-context/env/server";

/**
 * Get the opencode server URL from environment variable.
 * In Docker, this points to the opencode container.
 * In development, this can point to a local opencode instance.
 */
function getOpencodeUrl(): string {
  const url = env.OPENCODE_URL;
  console.log(`[opencode] Using opencode URL: ${url}`);
  return url;
}

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
  console.log(`[opencode] Starting streaming query for directory: ${repoPath}`);
  console.log(`[opencode] Query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`);
  if (model) {
    console.log(`[opencode] Using model: ${model.providerID}/${model.modelID}`);
  }
  
  const opencodeUrl = getOpencodeUrl();
  console.log(`[opencode] Server URL: ${opencodeUrl}`);

  // Create client with the repository directory
  let createOpencodeClient: any;
  try {
    const module = await import("@opencode-ai/sdk");
    createOpencodeClient = module.createOpencodeClient;
    console.log("[opencode] Using client from @opencode-ai/sdk package");
  } catch (error) {
    console.log("[opencode] Falling back to local context client");
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

  console.log(`[opencode] Creating client with baseUrl: ${opencodeUrl}, directory: ${repoPath}`);
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: repoPath,
  });

  // Create or reuse session
  let currentSessionId = sessionId;
  if (!currentSessionId) {
    const sessionTitle = `Query: ${query.substring(0, 50)}`;
    console.log(`[opencode] Creating session with title: ${sessionTitle}`);
    const sessionResult = await client.session.create({
      body: { title: sessionTitle },
    });

    if (sessionResult.error || !sessionResult.data) {
      const errorDetails = sessionResult.error 
        ? JSON.stringify(sessionResult.error, null, 2)
        : "No error object provided";
      console.error(`[opencode] Session creation failed. Error details:`, errorDetails);
      throw new Error(
        `Failed to create opencode session: ${sessionResult.error?.message || JSON.stringify(sessionResult.error) || "Unknown error"}`,
      );
    }

    currentSessionId = sessionResult.data.id;
    console.log(`[opencode] Session created successfully: ${currentSessionId}`);
  } else {
    console.log(`[opencode] Reusing existing session: ${currentSessionId}`);
  }

  try {
    // Subscribe to events before sending prompt
    const events = await client.event.subscribe();
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

    console.log(`[opencode] Sending prompt message to session ${currentSessionId}`);
    void client.session.prompt({
      path: { id: currentSessionId },
      body: promptBody,
    }).catch((error: any) => {
      console.error(`[opencode] Prompt send error:`, error);
    });

    // Process events and yield text chunks
    let accumulatedText = "";
    let assistantMessageId: string | null = null;
    let streamComplete = false;
    let waitingForAssistant = true;

    for await (const event of eventStream) {
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
          console.log(`[opencode] Found assistant message: ${assistantMessageId}`);
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
              console.log(`[opencode] Found assistant message from part: ${assistantMessageId}`);
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
          await new Promise(resolve => setTimeout(resolve, 500));
          if (accumulatedText && !streamComplete) {
            streamComplete = true;
            yield { text: "", done: true, sessionId: currentSessionId };
            return;
          }
        }
      }
    }

    // If we exit the loop, yield completion if we have text
    if (accumulatedText && !streamComplete) {
      yield { text: "", done: true, sessionId: currentSessionId };
    }
  } catch (error) {
    console.error(`[opencode] Error in queryOpencodeStream:`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(`[opencode] Error stack:`, error.stack);
    }
    throw error;
  }
}

export async function queryOpencode(
  repoPath: string,
  query: string,
): Promise<string> {
  console.log(`[opencode] Starting query for directory: ${repoPath}`);
  console.log(`[opencode] Query: ${query.substring(0, 100)}${query.length > 100 ? "..." : ""}`);
  
  const opencodeUrl = getOpencodeUrl();
  console.log(`[opencode] Server URL: ${opencodeUrl}`);

  // Create client with the repository directory
  // Try to use installed package first (for production/Docker)
  let createOpencodeClient: any;
  try {
    const module = await import("@opencode-ai/sdk");
    createOpencodeClient = module.createOpencodeClient;
    console.log("[opencode] Using client from @opencode-ai/sdk package");
  } catch (error) {
    console.log("[opencode] Falling back to local context client");
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

  console.log(`[opencode] Creating client with baseUrl: ${opencodeUrl}, directory: ${repoPath}`);
  const client = createOpencodeClient({
    baseUrl: opencodeUrl,
    directory: repoPath,
  });

  // Create a session
  const sessionTitle = `Query: ${query.substring(0, 50)}`;
  console.log(`[opencode] Creating session with title: ${sessionTitle}`);
  const sessionResult = await client.session.create({
    body: { title: sessionTitle },
  });

  console.log(`[opencode] Session create result:`, {
    hasError: !!sessionResult.error,
    hasData: !!sessionResult.data,
    error: sessionResult.error ? JSON.stringify(sessionResult.error, null, 2) : null,
    dataId: sessionResult.data?.id,
  });

  if (sessionResult.error || !sessionResult.data) {
    const errorDetails = sessionResult.error 
      ? JSON.stringify(sessionResult.error, null, 2)
      : "No error object provided";
    console.error(`[opencode] Session creation failed. Error details:`, errorDetails);
    console.error(`[opencode] Full session result:`, JSON.stringify(sessionResult, null, 2));
    throw new Error(
      `Failed to create opencode session: ${sessionResult.error?.message || JSON.stringify(sessionResult.error) || "Unknown error"}`,
    );
  }

  const sessionId = sessionResult.data.id;
  console.log(`[opencode] Session created successfully: ${sessionId}`);
  console.log(`[opencode] Session ID type: ${typeof sessionId}, starts with 'ses': ${String(sessionId).startsWith('ses')}`);

  try {
    // Use prompt to send the message (streaming endpoint)
    console.log(`[opencode] Sending prompt message to session ${sessionId}`);
    const promptResult = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [
          {
            type: "text",
            text: query,
          },
        ],
      },
    });

    // Log prompt result for debugging
    console.log(`[opencode] Prompt result:`, {
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
      console.error(`[opencode] Prompt failed. Error details:`, errorDetails);
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
        console.log(`[opencode] Received immediate response (${responseText.length} characters)`);
        return responseText;
      }
    }

    // If we didn't get a response immediately, wait for streaming to complete
    // then fetch messages using direct HTTP to bypass the SDK sessionID validation bug
    console.log(`[opencode] No immediate response, waiting for streaming to complete...`);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for streaming

    // Use direct HTTP request to bypass SDK bug with sessionID validation
    const messagesUrl = `${opencodeUrl}/session/${encodeURIComponent(sessionId)}/message?limit=5`;
    if (repoPath) {
      // Add directory as query parameter if we have it
      const encodedDir = encodeURIComponent(repoPath);
      const urlObj = new URL(messagesUrl);
      urlObj.searchParams.set('directory', encodedDir);
      const finalUrl = urlObj.toString();
      
      console.log(`[opencode] Fetching messages via direct HTTP: ${finalUrl}`);
      const response = await fetch(finalUrl, {
        headers: {
          'x-opencode-directory': repoPath, // Also set header for directory
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch messages: HTTP ${response.status} - ${errorText}`);
      }

      const messagesData = await response.json();
      
      if (!Array.isArray(messagesData)) {
        throw new Error(`Invalid messages response: expected array, got ${typeof messagesData}`);
      }

      // Find the last assistant message
      const assistantMessage = messagesData.find(
        (msg: any) => msg.info && msg.info.role === "assistant"
      );

      if (!assistantMessage) {
        throw new Error(`No assistant message found in session`);
      }

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
      console.log(`[opencode] Received response from HTTP messages (${responseText.length} characters)`);
      return responseText;
    } else {
      throw new Error(`Cannot fetch messages: no repository path available`);
    }
  } catch (error) {
    console.error(`[opencode] Error in queryOpencode:`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(`[opencode] Error stack:`, error.stack);
    }
    throw error;
  }
}