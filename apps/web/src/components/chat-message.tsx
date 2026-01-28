import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  /** Shown in the Thinking Process dropdown. When isThinkingPhase is true, the dropdown is shown even if this is empty. */
  thinking?: string;
  /** True while the assistant is in the thinking phase (streaming but no response text yet). Dropdown is shown immediately and stays open until this becomes false. */
  isThinkingPhase?: boolean;
  /** Display name for the assistant (e.g. from agent config). Defaults to "Kinetic Context". */
  agentName?: string;
}

export const ChatMessage = memo(function ChatMessage({ role, content, isStreaming, thinking, isThinkingPhase = false, agentName }: ChatMessageProps) {
  const isUser = role === "user";
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const assistantLabel = agentName ?? "Kinetic Context";

  // Show thinking dropdown when we're in thinking phase OR when we have thinking content
  const showThinkingDropdown = !isUser && (thinking !== undefined || isThinkingPhase);
  // During thinking phase the dropdown is forced open; after that it follows user toggle
  const isOpen = isThinkingPhase ? true : isThinkingOpen;

  useEffect(() => {
    if (!isThinkingPhase) {
      setIsThinkingOpen(false);
    }
  }, [isThinkingPhase]);

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4 px-1`}>
      <div className={`flex ${isUser ? "flex-row-reverse" : "flex-row"} items-start gap-2 w-full max-w-[85%]`}>
        <Card className={`flex-1 min-w-0 ${isUser ? "bg-primary text-primary-foreground" : ""}`}>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-1">{isUser ? "You" : assistantLabel}</div>
            {showThinkingDropdown && (
              <div className="mb-3 pb-3 border-b border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => !isThinkingPhase && setIsThinkingOpen((prev) => !prev)}
                >
                  {isOpen ? (
                    <ChevronUp className="size-3 mr-1" />
                  ) : (
                    <ChevronDown className="size-3 mr-1" />
                  )}
                  <span>Thinking Process</span>
                </Button>
                {isOpen && (
                  <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono bg-muted p-2 rounded min-h-[2rem]">
                    {thinking ?? ""}
                  </div>
                )}
              </div>
            )}
            <div className={`text-sm whitespace-pre-wrap break-words ${isUser ? "text-primary-foreground" : ""}`}>
              {content || (isStreaming && !isUser) ? (
                <>
                  {content}
                  {isStreaming && !isUser && (
                    <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
                  )}
                </>
              ) : null}
            </div>
            {isStreaming && !isUser && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                <span>{content ? "Thinking..." : "Waiting for response..."}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
