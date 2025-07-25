/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom LLM content generator configuration
 */
export interface CustomLLMContentGeneratorConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  stream_options?: {
    include_usage?: boolean;
  };
}

/**
 * Tool call data structure for streaming
 */
export interface ToolCallData {
  name: string;
  arguments: string;
}

/**
 * A single tool call from the AI SDK
 */
export interface AIToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Map for tracking tool calls during streaming
 */
export type ToolCallMap = Map<number, ToolCallData>;
