import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { chatDB, type ChatSessionMetadata } from "@/utils/chat-db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { History, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ChatHistorySelectorProps {
  packageIdentifier: string;
  currentSessionId?: string;
  onSessionSelect?: (sessionId: string) => void;
}

export function ChatHistorySelector({
  packageIdentifier,
  currentSessionId,
  onSessionSelect,
}: ChatHistorySelectorProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const loadedSessions = await chatDB.listSessions(packageIdentifier);
      setSessions(loadedSessions);
    } catch (error) {
      console.error("[ChatHistory] Failed to load sessions:", error);
      toast.error("Failed to load chat history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [packageIdentifier]);

  const handleSessionSelect = (sessionId: string) => {
    if (onSessionSelect) {
      onSessionSelect(sessionId);
    } else {
      navigate({
        to: "/package/$identifier/chat",
        params: { identifier: packageIdentifier },
        search: { sessionId },
        replace: true,
      });
    }
    // Reload sessions to update the list
    loadSessions();
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm("Delete this chat session?")) {
      try {
        await chatDB.deleteSession(sessionId, packageIdentifier);
        toast.success("Chat session deleted");
        loadSessions();
        // If we deleted the current session, navigate away
        if (sessionId === currentSessionId) {
          navigate({
            to: "/package/$identifier/chat",
            params: { identifier: packageIdentifier },
            search: {},
            replace: true,
          });
        }
      } catch (error) {
        console.error("[ChatHistory] Failed to delete session:", error);
        toast.error("Failed to delete chat session");
      }
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs h-7">
          <History className="size-3 mr-1" />
          History
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Chat History</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {isLoading ? (
            <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
          ) : sessions.length === 0 ? (
            <DropdownMenuItem disabled>No previous chats</DropdownMenuItem>
          ) : (
            sessions.map((session) => (
              <DropdownMenuItem
                key={session.sessionId}
                className="flex items-start justify-between gap-2 py-2"
                onSelect={() => handleSessionSelect(session.sessionId)}
                onClick={(e) => {
                  // Only handle click if it's not from the delete button
                  if ((e.target as HTMLElement).closest('button[aria-label*="Delete"]') === null) {
                    handleSessionSelect(session.sessionId);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {session.firstMessage || "New chat"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(session.timestamp)} • {session.messageCount} message
                    {session.messageCount !== 1 ? "s" : ""}
                  </div>
                </div>
                {session.sessionId === currentSessionId && (
                  <span className="text-xs text-muted-foreground">Current</span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-50 hover:opacity-100"
                  aria-label={`Delete chat session ${session.sessionId}`}
                  onClick={(e) => handleDeleteSession(e, session.sessionId)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
