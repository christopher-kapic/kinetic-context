import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { ModelSelector } from "@/components/model-selector";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

interface PackageChatProps {
  packageIdentifier: string;
}

export function PackageChat({ packageIdentifier }: PackageChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [currentStreamingText, setCurrentStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch available models
  const modelsQuery = useQuery(orpc.packages.getAvailableModels.queryOptions());

  // Set default model when models load
  useEffect(() => {
    if (modelsQuery.data && modelsQuery.data.length > 0 && !selectedModel) {
      const defaultModel = `${modelsQuery.data[0].providerId}/${modelsQuery.data[0].modelId}`;
      setSelectedModel(defaultModel);
    }
  }, [modelsQuery.data, selectedModel]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamingText]);

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
          retry: false,
        })
      : {
          queryKey: ["skip"],
          queryFn: () => null,
          enabled: false,
        }
  );

  // Handle streaming data
  useEffect(() => {
    if (streamingQuery.data && Array.isArray(streamingQuery.data)) {
      const events = streamingQuery.data;
      if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        
        // Update conversation ID if we got one
        if (lastEvent.sessionId && !conversationId) {
          setConversationId(lastEvent.sessionId);
        }

        // Accumulate all text from all events
        const fullText = events.map((e) => e.text).join("");
        setCurrentStreamingText(fullText);

        // If done, add the complete message to history
        if (lastEvent.done && fullText) {
          const assistantMessage: Message = {
            role: "assistant",
            content: fullText,
            id: `assistant-${Date.now()}`,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setCurrentStreamingText("");
          setIsStreaming(false);
          setStreamingQueryKey(null);
        }
      }
    }
  }, [streamingQuery.data, conversationId]);

  // Handle errors
  useEffect(() => {
    if (streamingQuery.error) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${streamingQuery.error instanceof Error ? streamingQuery.error.message : "Failed to get response"}`,
        id: `error-${Date.now()}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setCurrentStreamingText("");
      setIsStreaming(false);
      setStreamingQueryKey(null);
    }
  }, [streamingQuery.error]);

  const handleSendMessage = (message: string) => {
    if (!selectedModel) return;

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: message,
      id: `user-${Date.now()}`,
    };
    setMessages((prev) => [...prev, userMessage]);
    setCurrentStreamingText("");
    setIsStreaming(true);

    // Trigger streaming query
    setStreamingQueryKey({
      identifier: packageIdentifier,
      message,
      model: selectedModel,
      conversationId,
    });
  };

  if (modelsQuery.isLoading) {
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

  const models = modelsQuery.data || [];

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
      <div className="mb-4">
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          isLoading={modelsQuery.isLoading}
        />
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader>
          <CardTitle>Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto mb-4 pr-2">
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
              />
            ))}
            {isStreaming && currentStreamingText && (
              <ChatMessage
                role="assistant"
                content={currentStreamingText}
                isStreaming={true}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
          <ChatInput
            onSend={handleSendMessage}
            disabled={isStreaming || !selectedModel}
          />
        </CardContent>
      </Card>
    </div>
  );
}
