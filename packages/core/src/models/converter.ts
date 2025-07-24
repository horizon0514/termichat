/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  Part,
  GenerateContentParameters,
} from '@google/genai';
import {
  normalizeContents,
  isValidFunctionCall,
  isValidFunctionResponse,
} from './util.js';
import { CoreMessage } from 'ai';
import { ToolCallMap } from './types.js';

interface GenerateTextResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
  }>;
}

interface GenerateObjectResult {
  object: Record<string, unknown>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export class ModelConverter {
  /**
   * Convert Gemini content to AI SDK messages
   */
  static toOpenAIMessages(request: GenerateContentParameters): CoreMessage[] {
    const { contents, config } = request;
    const messages: CoreMessage[] = [];

    // Add system instruction if present
    if (
      config?.systemInstruction &&
      typeof config.systemInstruction === 'string'
    ) {
      messages.push({
        role: 'system',
        content: config.systemInstruction,
      });
    }

    const contentsArray = normalizeContents(contents);
    for (const content of contentsArray) {
      const role =
        content.role === 'model'
          ? 'assistant'
          : (content.role as 'user' | 'system');
      const parts = content.parts || [];
      this.processTextParts(parts, role, messages);
      this.processFunctionResponseParts(parts, messages);
      this.processFunctionCallParts(parts, messages);
    }
    return messages;
  }

  /**
   * Convert text parts to AI SDK messages
   */
  private static processTextParts(
    parts: Part[],
    role: string,
    messages: CoreMessage[],
  ): void {
    const textParts = parts.filter(
      (part): part is { text: string } =>
        typeof part === 'object' && part !== null && 'text' in part,
    );
    if (textParts.length > 0) {
      const text = textParts.map((part) => part.text).join('\n');
      if (role === 'user') {
        messages.push({
          role: 'user',
          content: text,
        });
      } else if (role === 'system') {
        messages.push({
          role: 'system',
          content: text,
        });
      } else if (role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: text,
        });
      }
    }
  }

  /**
   * Convert function response parts to AI SDK messages
   */
  private static processFunctionResponseParts(
    parts: Part[],
    messages: CoreMessage[],
  ): void {
    const frParts = parts.filter(isValidFunctionResponse);
    if (frParts.length > 0) {
      for (const part of frParts) {
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: part.functionResponse.id,
              toolName: part.functionResponse.name,
              result: part.functionResponse.response.error
                ? `Error: ${part.functionResponse.response.error}`
                : part.functionResponse.response.output || '',
            },
          ],
        });
      }
      this.processImageParts(parts, messages);
    }
  }

  /**
   * Convert image parts to AI SDK messages
   */
  private static processImageParts(
    parts: Part[],
    messages: CoreMessage[],
  ): void {
    const imgParts = parts.filter((part) => part.inlineData);
    if (imgParts.length > 0) {
      const { inlineData = '' } = imgParts[0];
      if (
        inlineData &&
        inlineData.mimeType?.startsWith('image/') &&
        inlineData.data
      ) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              image: new Uint8Array(Buffer.from(inlineData.data, 'base64')),
              mimeType: inlineData.mimeType,
            },
          ],
        });
      }
    }
  }

  /**
   * Convert function call parts to AI SDK messages
   */
  private static processFunctionCallParts(
    parts: Part[],
    messages: CoreMessage[],
  ): void {
    const fcParts = parts.filter(isValidFunctionCall);
    if (fcParts.length > 0) {
      const toolCalls = fcParts.map((part) => ({
        type: 'tool-call' as const,
        toolCallId: `call_${Math.random().toString(36).slice(2)}`,
        toolName: part.functionCall.name,
        args: part.functionCall.args,
      }));

      messages.push({
        role: 'assistant',
        content: toolCalls,
      });
    }
  }

  /**
   * Convert AI SDK response to Gemini response
   */
  static toGeminiResponse(result: GenerateTextResult): GenerateContentResponse {
    const res = new GenerateContentResponse();

    if (result.text) {
      res.candidates = [
        {
          content: {
            parts: [{ text: result.text }],
            role: 'model',
          },
          index: 0,
          safetyRatings: [],
        },
      ];
    } else if (result.toolCalls && result.toolCalls.length > 0) {
      res.candidates = [
        {
          content: {
            parts: result.toolCalls.map((toolCall) => ({
              functionCall: {
                name: toolCall.toolName,
                args: toolCall.args,
              },
            })),
            role: 'model',
          },
          index: 0,
          safetyRatings: [],
        },
      ];
    }

    res.usageMetadata = {
      promptTokenCount: result.usage?.promptTokens || 0,
      candidatesTokenCount: result.usage?.completionTokens || 0,
      totalTokenCount: result.usage?.totalTokens || 0,
    };

    return res;
  }

  /**
   * Convert AI SDK generateObject response to Gemini response
   */
  static toGeminiObjectResponse(
    result: GenerateObjectResult,
  ): GenerateContentResponse {
    const res = new GenerateContentResponse();

    // Convert the object to JSON string for the text response
    const jsonText = JSON.stringify(result.object);

    res.candidates = [
      {
        content: {
          parts: [{ text: jsonText }],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];

    res.usageMetadata = {
      promptTokenCount: result.usage?.promptTokens || 0,
      candidatesTokenCount: result.usage?.completionTokens || 0,
      totalTokenCount: result.usage?.totalTokens || 0,
    };

    return res;
  }

  /**
   * Convert streaming text content to Gemini response
   */
  static toGeminiStreamTextResponse(content: string): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [{ text: content }],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    return res;
  }

  /**
   * Convert completed tool calls to Gemini response
   */
  static toGeminiStreamToolCallsResponse(
    toolCallMap: ToolCallMap,
  ): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: Array.from(toolCallMap.entries()).map(
            ([_index, toolCall]) => ({
              functionCall: {
                name: toolCall.name,
                args: toolCall.arguments ? JSON.parse(toolCall.arguments) : {},
              },
            }),
          ),
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    return res;
  }

  /**
   * Create final response for stream completion
   */
  static toGeminiStreamEndResponse(): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    return res;
  }

  /**
   * Create final response for stream completion with usage info
   */
  static toGeminiStreamUsageResponse(usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [],
          role: 'model',
        },
        index: 0,
        safetyRatings: [],
      },
    ];
    res.usageMetadata = {
      promptTokenCount: usage.promptTokens || 0,
      candidatesTokenCount: usage.completionTokens || 0,
      totalTokenCount: usage.totalTokens || 0,
    };
    return res;
  }
}
