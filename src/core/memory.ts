import { BaseCheckpointSaver } from "@langchain/langgraph";
import { Checkpoint, CheckpointMetadata, CheckpointTuple } from "@langchain/langgraph";

/**
 * In-memory checkpoint saver for conversation persistence
 * This allows the agent to maintain state across interactions
 */
export class MemoryCheckpointSaver extends BaseCheckpointSaver {
  private checkpoints: Map<string, CheckpointTuple> = new Map();

  async getTuple(config: { configurable?: { thread_id?: string } }): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id || "default";
    return this.checkpoints.get(threadId);
  }

  async *list(
    config: { configurable?: { thread_id?: string } },
    options?: { limit?: number; before?: { configurable?: { thread_id?: string } } }
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id || "default";
    const checkpoint = this.checkpoints.get(threadId);
    if (checkpoint) {
      yield checkpoint;
    }
  }

  async put(
    config: { configurable?: { thread_id?: string } },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<{ configurable: { thread_id: string } }> {
    const threadId = config.configurable?.thread_id || "default";

    const tuple: CheckpointTuple = {
      config: { configurable: { thread_id: threadId } },
      checkpoint,
      metadata,
      parentConfig: config.configurable?.thread_id ? config : undefined,
    };

    this.checkpoints.set(threadId, tuple);
    return { configurable: { thread_id: threadId } };
  }

  /**
   * Clear all checkpoints for a specific thread
   */
  clearThread(threadId: string = "default"): void {
    this.checkpoints.delete(threadId);
  }

  /**
   * Clear all checkpoints
   */
  clearAll(): void {
    this.checkpoints.clear();
  }

  /**
   * Get all thread IDs
   */
  getThreadIds(): string[] {
    return Array.from(this.checkpoints.keys());
  }
}

// Export a singleton instance
export const memoryCheckpointer = new MemoryCheckpointSaver();
