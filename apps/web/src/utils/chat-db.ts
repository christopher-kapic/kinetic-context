import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";

interface ChatMessage {
  id?: number;
  sessionId: string;
  packageIdentifier: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  timestamp: number;
}

interface ChatSessionMetadata {
  sessionId: string;
  packageIdentifier: string;
  firstMessage: string;
  timestamp: number;
  messageCount: number;
}

interface ChatDB extends DBSchema {
  messages: {
    key: number;
    value: ChatMessage;
    indexes: {
      sessionId: string;
      packageIdentifier: string;
      timestamp: number;
      "sessionId-packageIdentifier": [string, string];
    };
  };
}

class ChatDatabase {
  private dbPromise: Promise<IDBPDatabase<ChatDB>>;

  constructor() {
    this.dbPromise = openDB<ChatDB>("chat-database", 1, {
      upgrade(db) {
        // Create object store for messages
        const store = db.createObjectStore("messages", {
          keyPath: "id",
          autoIncrement: true,
        });

        // Create indexes for efficient queries
        store.createIndex("sessionId", "sessionId");
        store.createIndex("packageIdentifier", "packageIdentifier");
        store.createIndex("timestamp", "timestamp");
        // Composite index for sessionId + packageIdentifier queries
        store.createIndex("sessionId-packageIdentifier", [
          "sessionId",
          "packageIdentifier",
        ]);
      },
    });
  }

  /**
   * Add a message to the database
   */
  async addMessage(
    sessionId: string,
    packageIdentifier: string,
    message: Omit<ChatMessage, "id" | "sessionId" | "packageIdentifier" | "timestamp">
  ): Promise<number> {
    const db = await this.dbPromise;
    return await db.add("messages", {
      sessionId,
      packageIdentifier,
      ...message,
      timestamp: Date.now(),
    });
  }

  /**
   * Get all messages for a specific session and package
   */
  async getSessionMessages(
    sessionId: string,
    packageIdentifier: string
  ): Promise<ChatMessage[]> {
    const db = await this.dbPromise;
    const tx = db.transaction("messages", "readonly");
    const index = tx.store.index("sessionId-packageIdentifier");
    
    const messages: ChatMessage[] = [];
    for await (const cursor of index.iterate([sessionId, packageIdentifier])) {
      messages.push(cursor.value);
    }
    
    // Sort by timestamp to ensure chronological order
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * List all session IDs for a specific package
   */
  async listSessions(packageIdentifier: string): Promise<ChatSessionMetadata[]> {
    const db = await this.dbPromise;
    const tx = db.transaction("messages", "readonly");
    const index = tx.store.index("packageIdentifier");
    
    const sessionMap = new Map<string, {
      firstMessage: string;
      timestamp: number;
      messageCount: number;
    }>();
    
    for await (const cursor of index.iterate(packageIdentifier)) {
      const msg = cursor.value;
      if (!sessionMap.has(msg.sessionId)) {
        sessionMap.set(msg.sessionId, {
          firstMessage: msg.content.substring(0, 100),
          timestamp: msg.timestamp,
          messageCount: 0,
        });
      }
      const session = sessionMap.get(msg.sessionId)!;
      session.messageCount++;
      // Update timestamp to the earliest message
      if (msg.timestamp < session.timestamp) {
        session.timestamp = msg.timestamp;
      }
    }
    
    return Array.from(sessionMap.entries())
      .map(([sessionId, metadata]) => ({
        sessionId,
        packageIdentifier,
        ...metadata,
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }

  /**
   * Get metadata for a specific session
   */
  async getSessionMetadata(
    sessionId: string,
    packageIdentifier: string
  ): Promise<ChatSessionMetadata | null> {
    const messages = await this.getSessionMessages(sessionId, packageIdentifier);
    if (messages.length === 0) {
      return null;
    }
    
    const firstMessage = messages[0]?.content.substring(0, 100) || "";
    const timestamp = messages[0]?.timestamp || Date.now();
    
    return {
      sessionId,
      packageIdentifier,
      firstMessage,
      timestamp,
      messageCount: messages.length,
    };
  }

  /**
   * Delete all messages for a specific session
   */
  async deleteSession(sessionId: string, packageIdentifier: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction("messages", "readwrite");
    const index = tx.store.index("sessionId-packageIdentifier");
    
    for await (const cursor of index.iterate([sessionId, packageIdentifier])) {
      await cursor.delete();
    }
    
    await tx.done;
  }

  /**
   * Delete all messages for a package (cleanup)
   */
  async deletePackageSessions(packageIdentifier: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction("messages", "readwrite");
    const index = tx.store.index("packageIdentifier");
    
    for await (const cursor of index.iterate(packageIdentifier)) {
      await cursor.delete();
    }
    
    await tx.done;
  }
}

// Export a singleton instance
export const chatDB = new ChatDatabase();

// Export types for use in components
export type { ChatMessage, ChatSessionMetadata };
