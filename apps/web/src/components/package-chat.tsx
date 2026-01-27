import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { orpc } from "@/utils/orpc";
import { chatDB, type ChatMessage as DBChatMessage } from "@/utils/chat-db";
import { ModelSelector } from "@/components/model-selector";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { ChatHistorySelector } from "@/components/chat-history-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
  thinking?: string;
}

interface PackageChatProps {
  packageIdentifier: string;
  initialSessionId?: string;
}

export function PackageChat({ packageIdentifier, initialSessionId }: PackageChatProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>(initialSessionId);
  const [currentStreamingText, setCurrentStreamingText] = useState("");
  const [currentStreamingThinking, setCurrentStreamingThinking] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastProcessedIndexRef = useRef(-1);
  const hasLoadedHistoryRef = useRef(false);
  const savedMessageIdsRef = useRef<Set<string>>(new Set());
  const hasAddedFinalMessageRef = useRef(false);

  // Fetch available models
  const modelsQuery = useQuery(orpc.packages.getAvailableModels.queryOptions());
  
  // Fetch agent info
  const agentInfoQuery = useQuery(orpc.packages.getAgentInfo.queryOptions());

  // Set default model when models load
  useEffect(() => {
    if (modelsQuery.data && !selectedModel) {
      const { models, defaultModel } = modelsQuery.data;
      if (models.length > 0) {
        // Use defaultModel from config if available, otherwise use first model
        const modelToUse = defaultModel || `${models[0].providerId}/${models[0].modelId}`;
        setSelectedModel(modelToUse);
      }
    }
  }, [modelsQuery.data, selectedModel]);

  // Load chat history from IndexedDB on mount if sessionId is provided
  useEffect(() => {
    // If initialSessionId is undefined, clear everything immediately
    if (!initialSessionId) {
      // Only reset if we had a session before or have messages
      if (hasLoadedHistoryRef.current || messages.length > 0 || conversationId) {
        setMessages([]);
        setConversationId(undefined);
        hasLoadedHistoryRef.current = false;
        savedMessageIdsRef.current.clear();
        setCurrentStreamingText("");
        setCurrentStreamingThinking(undefined);
        setIsStreaming(false);
      }
      return;
    }
    
    // If we have an initialSessionId, load history if we haven't already
    // Reset the loaded flag if sessionId changed
    if (initialSessionId !== conversationId) {
      hasLoadedHistoryRef.current = false;
    }
    
    if (initialSessionId && !hasLoadedHistoryRef.current) {
      hasLoadedHistoryRef.current = true;
      setIsLoadingHistory(true);
      chatDB
        .getSessionMessages(initialSessionId, packageIdentifier)
        .then((dbMessages) => {
          if (dbMessages.length > 0) {
            const loadedMessages: Message[] = dbMessages.map((msg) => ({
              role: msg.role,
              content: msg.content,
              id: `loaded-${msg.id}`,
              thinking: msg.thinking,
            }));
            setMessages(loadedMessages);
            setConversationId(initialSessionId);
            // Mark loaded messages as saved to prevent re-saving
            loadedMessages.forEach((msg) => {
              savedMessageIdsRef.current.add(msg.id);
            });
          } else {
            // Session doesn't exist in DB, clear it
            setConversationId(undefined);
            setMessages([]);
            savedMessageIdsRef.current.clear();
          }
        })
        .catch((error) => {
          console.error("[Chat] Failed to load chat history:", error);
        })
        .finally(() => {
          setIsLoadingHistory(false);
        });
    }
  }, [initialSessionId, packageIdentifier]);

  // Helper function to save a message to IndexedDB (non-blocking)
  const saveMessage = useCallback(async (message: Message, sessionId?: string) => {
    const idToUse = sessionId || conversationId;
    // Only save if we have a conversationId, the message wasn't loaded from DB, and we haven't saved it yet
    if (idToUse && !message.id.startsWith("loaded-") && !savedMessageIdsRef.current.has(message.id)) {
      // Mark as saved immediately to prevent duplicate saves
      savedMessageIdsRef.current.add(message.id);
      // Fire-and-forget: don't await, but handle errors
      chatDB.addMessage(idToUse, packageIdentifier, {
        role: message.role,
        content: message.content,
        thinking: message.thinking,
      }).catch((error) => {
        console.error("[Chat] Failed to save message:", error);
        // Remove from saved set on error so it can be retried
        savedMessageIdsRef.current.delete(message.id);
      });
    }
  }, [conversationId, packageIdentifier]);

  // Update URL when conversationId changes
  useEffect(() => {
    if (conversationId) {
      navigate({
        to: "/package/$identifier/chat",
        params: { identifier: packageIdentifier },
        search: { sessionId: conversationId },
        replace: true,
      });
    }
  }, [conversationId, packageIdentifier, navigate]);

  // Track which messages have been queued for saving to avoid duplicates
  const messagesToSaveRef = useRef<Set<string>>(new Set());

  // Save any unsaved messages when conversationId becomes available
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      // Only process messages that haven't been queued for saving
      messages.forEach((msg) => {
        if (!msg.id.startsWith("loaded-") && !messagesToSaveRef.current.has(msg.id)) {
          messagesToSaveRef.current.add(msg.id);
          saveMessage(msg).catch(() => {
            // Remove from queue on error so it can be retried
            messagesToSaveRef.current.delete(msg.id);
          });
        }
      });
    }
  }, [conversationId, messages, saveMessage]);

  // Scroll to bottom when messages change
  // Use 'auto' during streaming for better performance, 'smooth' only when message is complete
  useEffect(() => {
    if (messagesEndRef.current) {
      // Use smooth scrolling only when not actively streaming (final message added)
      // Use auto (instant) during streaming for better performance
      messagesEndRef.current.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth" });
    }
  }, [messages.length, isStreaming]); // Only depend on length and streaming state, not content

  // Streaming query - we'll use a manual approach since we need to control when it runs
  const [streamingQueryKey, setStreamingQueryKey] = useState<{
    identifier: string;
    message: string;
    model: string;
    conversationId?: string;
  } | null>(null);

  const streamingQuery = useQuery(
    streamingQueryKey
      ? orpc.packages.chat.experimental_streamedOptions({
          input: {
            identifier: streamingQueryKey.identifier,
            message: streamingQueryKey.message,
            model: streamingQueryKey.model,
            conversationId: streamingQueryKey.conversationId,
          },
          retry: true, // Infinite retry for reliable streaming
          queryFnOptions: {
            refetchMode: 'reset', // Reset data on refetch
            // Don't set maxChunks - we want all events for chat
          },
        })
      : {
          queryKey: ["skip"],
          queryFn: () => null,
          enabled: false,
        }
  );

  // Use refs for values that don't need to trigger re-renders
  const currentStreamingTextRef = useRef("");
  const currentStreamingThinkingRef = useRef<string | undefined>(undefined);

  // Sync refs with state for reading
  useEffect(() => {
    currentStreamingTextRef.current = currentStreamingText;
    currentStreamingThinkingRef.current = currentStreamingThinking;
  }, [currentStreamingText, currentStreamingThinking]);

  // Handle streaming data
  useEffect(() => {
    if (streamingQuery.data && Array.isArray(streamingQuery.data)) {
      const events = streamingQuery.data;
      
      // Only process new events since the last processed index
      const startIndex = lastProcessedIndexRef.current + 1;
      if (startIndex < events.length) {
        const newEvents = events.slice(startIndex);
        
        // Accumulate text incrementally from new events only
        let accumulatedText = currentStreamingTextRef.current;
        let latestThinking: string | undefined = currentStreamingThinkingRef.current;
        
        for (const event of newEvents) {
          // Each event contains incremental text, so append it
          if (event.text) {
            accumulatedText += event.text;
          }
          
          // Update thinking if this event has it — always set state so the thinking UI
          // appears and updates as chunks arrive, not only when the ref happens to differ
          if (event.thinking !== undefined) {
            latestThinking = event.thinking;
            setCurrentStreamingThinking(latestThinking);
          }
          
          // Update conversation ID if we got one
          if (event.sessionId) {
            const newSessionId = event.sessionId;
            setConversationId((prev) => {
              if (!prev) {
                return newSessionId;
              }
              return prev !== newSessionId ? newSessionId : prev;
            });
          }
          
          // If this event is done, handle completion
          if (event.done) {
            // Clear streaming state BEFORE adding message to prevent duplicate display
            setCurrentStreamingText("");
            setIsStreaming(false);
            setCurrentStreamingThinking(undefined);
            hasAddedFinalMessageRef.current = true;
            
            if (accumulatedText) {
              const assistantMessage: Message = {
                role: "assistant",
                content: accumulatedText,
                id: `assistant-${Date.now()}-${Math.random()}`,
                thinking: latestThinking,
              };
              setMessages((prev) => [...prev, assistantMessage]);
              
              // Save assistant message to IndexedDB (fire-and-forget with error handling)
              const sessionIdToUse = event.sessionId || conversationId;
              if (sessionIdToUse) {
                saveMessage(assistantMessage, sessionIdToUse).catch((err) => {
                  console.error("[Chat] Failed to save message:", err);
                });
              }
            }
            
            setStreamingQueryKey(null);
            lastProcessedIndexRef.current = -1; // Reset for next stream
            hasAddedFinalMessageRef.current = false;
            return; // Exit early since stream is complete
          }
        }
        
        // Update state with accumulated text from new events
        if (accumulatedText !== currentStreamingTextRef.current) {
          setCurrentStreamingText(accumulatedText);
        }
        
        // Ensure thinking state is set after processing all new events
        if (latestThinking !== undefined) {
          setCurrentStreamingThinking(latestThinking);
        }
        
        // Update the last processed index
        lastProcessedIndexRef.current = events.length - 1;
        
        // Ensure isStreaming is true while processing
        setIsStreaming(true);
      }
    } else if (streamingQuery.isLoading || streamingQuery.isFetching) {
      // Show loading state while query is active
      setIsStreaming(true);
    }
  }, [streamingQuery.data, streamingQuery.isLoading, streamingQuery.isFetching, streamingQuery.error, streamingQueryKey, conversationId, saveMessage]);

  // Handle errors
  useEffect(() => {
    if (streamingQuery.error) {
      const error = streamingQuery.error;
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : typeof error === "string" ? error : "Failed to get response. Please try again."}`,
        id: `error-${Date.now()}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setCurrentStreamingText("");
      setCurrentStreamingThinking(undefined);
      setIsStreaming(false);
      setStreamingQueryKey(null);
    }
  }, [streamingQuery.error]);

  const processMessage = useCallback((trimmedMessage: string) => {
    if (!selectedModel) return;

    // Determine if we're starting a fresh chat (no messages or conversationId is undefined)
    // If starting fresh, explicitly pass undefined to ensure a new session is created
    const shouldStartNewSession = messages.length === 0 || !conversationId;
    const conversationIdToUse = shouldStartNewSession ? undefined : conversationId;

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: trimmedMessage,
      id: `user-${Date.now()}`,
    };
    setMessages((prev) => [...prev, userMessage]);
    
    // Save user message to IndexedDB (will save when conversationId is available)
    // If we don't have a conversationId yet, it will be set when the server responds
    // We'll save it then via a useEffect that watches conversationId
    setCurrentStreamingText("");
    setCurrentStreamingThinking(undefined);
    setIsStreaming(true);
    lastProcessedIndexRef.current = -1; // Reset index for new stream
    hasAddedFinalMessageRef.current = false; // Reset final message flag

    // Trigger streaming query - experimental_streamedOptions will accumulate events in an array
    // Pass undefined conversationId when starting fresh to force new session creation
    setStreamingQueryKey({
      identifier: packageIdentifier,
      message: trimmedMessage,
      model: selectedModel,
      conversationId: conversationIdToUse,
    });
  }, [selectedModel, conversationId, packageIdentifier, messages.length]);

  const handleSendMessage = (message: string) => {
    if (!selectedModel) return;
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    // If currently streaming, add to queue instead of processing immediately
    if (isStreaming) {
      setMessageQueue((prev) => [...prev, trimmedMessage]);
      return;
    }

    // Process message immediately
    processMessage(trimmedMessage);
  };

  // Process queue when streaming stops
  useEffect(() => {
    if (!isStreaming && messageQueue.length > 0 && selectedModel) {
      const nextMessage = messageQueue[0];
      setMessageQueue((prev) => prev.slice(1));
      // Small delay to ensure state is settled
      setTimeout(() => {
        processMessage(nextMessage);
      }, 100);
    }
  }, [isStreaming, messageQueue.length, selectedModel, processMessage]);

  const handleNewChat = () => {
    // Clear all state synchronously to prevent any race conditions
    setMessages([]);
    setConversationId(undefined);
    setCurrentStreamingText("");
    setCurrentStreamingThinking(undefined);
    setIsStreaming(false);
    hasLoadedHistoryRef.current = false;
    savedMessageIdsRef.current.clear();
    messagesToSaveRef.current.clear();
    lastProcessedIndexRef.current = -1;
    hasAddedFinalMessageRef.current = false;
    setStreamingQueryKey(null);
    // Clear sessionId from URL - this will cause initialSessionId to become undefined
    // which will trigger the useEffect to properly reset everything
    navigate({
      to: "/package/$identifier/chat",
      params: { identifier: packageIdentifier },
      search: {},
      replace: true,
    });
  };

  if (modelsQuery.isLoading || isLoadingHistory) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (modelsQuery.error) {
    return (
      <Alert className="border-destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>
          Failed to load models: {modelsQuery.error instanceof Error ? modelsQuery.error.message : "Unknown error"}
        </AlertDescription>
      </Alert>
    );
  }

  const models = modelsQuery.data?.models || [];

  if (models.length === 0) {
    return (
      <Alert>
        <AlertCircle className="size-4" />
        <AlertDescription>
          No models available. Please configure a model provider in the Models page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 space-y-2">
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          isLoading={modelsQuery.isLoading}
        />
        <div className="flex items-center space-x-2">
          <Checkbox
            id="show-thinking"
            checked={showThinking}
            onCheckedChange={(checked) => setShowThinking(checked === true)}
          />
          <Label htmlFor="show-thinking" className="text-sm font-normal cursor-pointer">
            Show thinking process
          </Label>
        </div>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Chat</CardTitle>
            <div className="flex items-center gap-4">
              {agentInfoQuery.data && (
                <div className="text-xs text-muted-foreground">
                  Agent: {agentInfoQuery.data.name}
                </div>
              )}
              <ChatHistorySelector
                packageIdentifier={packageIdentifier}
                currentSessionId={conversationId}
                onSessionSelect={(sessionId) => {
                  // Navigate to the selected session
                  navigate({
                    to: "/package/$identifier/chat",
                    params: { identifier: packageIdentifier },
                    search: { sessionId },
                    replace: true,
                  });
                }}
              />
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  className="text-xs h-7"
                >
                  New Chat
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto mb-4 pr-2 overflow-x-hidden">
            {messages.length === 0 && !isStreaming && (
              <div className="text-center text-muted-foreground py-8">
                Start a conversation by asking a question about this package.
              </div>
            )}
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                // Show thinking in messages for historical context (when showThinking is enabled)
                thinking={showThinking ? message.thinking : undefined}
              />
            ))}
            {isStreaming && currentStreamingText && !hasAddedFinalMessageRef.current && (
              <ChatMessage
                role="assistant"
                content={currentStreamingText}
                isStreaming={true}
                thinking={showThinking ? currentStreamingThinking : undefined}
                isThinkingPhase={false}
              />
            )}
            {isStreaming && !currentStreamingText && (
              <ChatMessage
                role="assistant"
                content=""
                isStreaming={true}
                thinking={showThinking ? (currentStreamingThinking ?? "") : undefined}
                isThinkingPhase={showThinking}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
          <ChatInput
            onSend={handleSendMessage}
            disabled={!selectedModel || modelsQuery.isLoading}
            queueCount={messageQueue.length}
          />
        </CardContent>
      </Card>
    </div>
  );
}
