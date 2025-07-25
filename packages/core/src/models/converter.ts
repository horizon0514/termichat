/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  Part,
  GenerateContentParameters,
  ToolListUnion,
} from '@google/genai';
import {
  normalizeContents,
  isValidFunctionCall,
  isValidFunctionResponse,
} from './util.js';
import { CoreMessage, tool, ToolSet } from 'ai';
import { z, ZodTypeAny } from 'zod';
import { AIToolCall } from './types.js';

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

interface GenerateObjectResult<T> {
  object: T;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export class ModelConverter {
  /**
   * Convert Gemini tool definitions to AI SDK tools
   */
  static toAiSDKTools(
    geminiTools: ToolListUnion | undefined,
  ): ToolSet | undefined {
    if (!geminiTools) {
      return undefined;
    }

    const aiTools: ToolSet = {};

    for (const geminiTool of geminiTools) {
      if (
        'functionDeclarations' in geminiTool &&
        geminiTool.functionDeclarations
      ) {
        for (const func of geminiTool.functionDeclarations) {
          if (func.name) {
            aiTools[func.name] = tool({
              description: func.description,
              parameters: this.convertJsonSchemaToZod(func.parameters),
            });
          }
        }
      }
    }

    return Object.keys(aiTools).length > 0 ? aiTools : undefined;
  }

  /**
   * Convert a JSON schema to a Zod schema.
   */
  private static convertJsonSchemaToZod(jsonSchema: unknown): ZodTypeAny {
    if (
      !jsonSchema ||
      typeof jsonSchema !== 'object' ||
      !('properties' in jsonSchema) ||
      typeof jsonSchema.properties !== 'object' ||
      !jsonSchema.properties
    ) {
      return z.object({});
    }

    const shape: Record<string, ZodTypeAny> = {};
    const requiredFields = new Set(
      'required' in jsonSchema && Array.isArray(jsonSchema.required)
        ? jsonSchema.required
        : [],
    );

    for (const [key, prop] of Object.entries(
      jsonSchema.properties as Record<string, unknown>,
    )) {
      let fieldSchema = this.jsonTypeToZod(prop);
      if (!requiredFields.has(key)) {
        fieldSchema = fieldSchema.optional();
      }
      shape[key] = fieldSchema;
    }

    return z.object(shape);
  }

  /**
   * Convert a JSON schema type to a Zod type.
   */
  private static jsonTypeToZod(property: unknown): ZodTypeAny {
    if (!property || typeof property !== 'object') {
      return z.any();
    }

    const prop = property as Record<string, unknown> & {
      type?: string;
      description?: string;
      enum?: string[];
      items?: unknown;
    };

    let schema: ZodTypeAny;

    switch (prop.type) {
      case 'string':
        if (prop.enum) {
          schema = z.enum(prop.enum as [string, ...string[]]);
        } else {
          schema = z.string();
        }
        break;
      case 'number':
      case 'integer':
        schema = z.number();
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'object':
        schema = this.convertJsonSchemaToZod(prop);
        break;
      case 'array':
        schema = z.array(this.jsonTypeToZod(prop.items));
        break;
      default:
        schema = z.any();
        break;
    }

    if (prop.description) {
      return schema.describe(prop.description);
    }

    return schema;
  }

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
    const parts: Part[] = [];

    if (result.text) {
      parts.push({ text: result.text });
    }

    if (result.toolCalls && result.toolCalls.length > 0) {
      parts.push(
        ...result.toolCalls.map((toolCall) => ({
          functionCall: {
            name: toolCall.toolName,
            args: toolCall.args,
          },
        })),
      );
    }

    if (parts.length > 0) {
      res.candidates = [
        {
          content: {
            parts,
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
    result: GenerateObjectResult<Record<string, unknown>>,
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
    toolCall: AIToolCall,
  ): GenerateContentResponse {
    const res = new GenerateContentResponse();
    res.candidates = [
      {
        content: {
          parts: [
            {
              functionCall: {
                name: toolCall.toolName,
                args: toolCall.args,
              },
            },
          ],
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
