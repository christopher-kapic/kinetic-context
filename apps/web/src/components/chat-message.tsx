import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <Card className={`max-w-[80%] ${isUser ? "bg-primary text-primary-foreground" : ""}`}>
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-1">{isUser ? "You" : "Assistant"}</div>
          <div className={`text-sm whitespace-pre-wrap ${isUser ? "text-primary-foreground" : ""}`}>
            {content}
            {isStreaming && !isUser && (
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            )}
          </div>
          {isStreaming && !isUser && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
