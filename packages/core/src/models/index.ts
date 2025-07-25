/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
  streamText,
  generateObject,
  streamObject,
  jsonSchema,
} from 'ai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { CustomLLMContentGeneratorConfig } from './types.js';
import { ModelConverter } from './converter.js';

export class CustomLLMContentGenerator implements ContentGenerator {
  private model: ReturnType<typeof createOpenAI>;
  private apiKey: string = process.env.CUSTOM_LLM_API_KEY || '';
  private baseURL: string = process.env.CUSTOM_LLM_BASE_URL || '';
  private modelName: string = process.env.CUSTOM_LLM_MODEL_NAME || '';
  private temperature: number = Number(process.env.CUSTOM_LLM_TEMPERATURE || 0);
  private maxTokens: number = Number(process.env.CUSTOM_LLM_MAX_TOKENS || 8192);
  private topP: number = Number(process.env.CUSTOM_LLM_TOP_P || 1);
  private config: CustomLLMContentGeneratorConfig = {
    model: this.modelName,
    temperature: this.temperature,
    max_tokens: this.maxTokens,
    top_p: this.topP,
  };

  constructor() {
    this.model = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
  }

  /**
   * Normalizes a schema to ensure it has proper type declarations for use with Vercel AI SDK
   */
  private normalizeSchema(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized = { ...schema };

    // If schema has properties but no type, it should be "object"
    if (normalized.properties && !normalized.type) {
      normalized.type = 'object';
    }

    // Recursively normalize properties
    if (normalized.properties && typeof normalized.properties === 'object') {
      const normalizedProperties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(normalized.properties)) {
        if (typeof value === 'object' && value !== null) {
          normalizedProperties[key] = this.normalizeSchema(
            value as Record<string, unknown>,
          );
        } else {
          normalizedProperties[key] = value;
        }
      }
      normalized.properties = normalizedProperties;
    }

    // Handle arrays
    if (normalized.items && typeof normalized.items === 'object') {
      normalized.items = this.normalizeSchema(
        normalized.items as Record<string, unknown>,
      );
    }

    // Handle anyOf/oneOf
    if (Array.isArray(normalized.anyOf)) {
      normalized.anyOf = normalized.anyOf.map((item) =>
        typeof item === 'object' && item !== null
          ? this.normalizeSchema(item as Record<string, unknown>)
          : item,
      );
    }

    if (Array.isArray(normalized.oneOf)) {
      normalized.oneOf = normalized.oneOf.map((item) =>
        typeof item === 'object' && item !== null
          ? this.normalizeSchema(item as Record<string, unknown>)
          : item,
      );
    }

    return normalized;
  }

  /**
   * Asynchronously generates content responses in a streaming fashion.
   */
  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = ModelConverter.toOpenAIMessages(request);

    // Check if this is a structured JSON output request
    const isJsonRequest =
      request.config?.responseMimeType === 'application/json' &&
      request.config?.responseSchema;

    if (isJsonRequest && request.config?.responseSchema) {
      // Use streamObject for structured JSON output
      const rawSchema = request.config.responseSchema as Record<
        string,
        unknown
      >;
      const normalizedSchema = this.normalizeSchema(rawSchema);

      try {
        const stream = streamObject({
          model: this.model(this.modelName),
          messages,
          schema: jsonSchema(normalizedSchema),
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
        });

        return (async function* (): AsyncGenerator<GenerateContentResponse> {
          for await (const chunk of stream.textStream) {
            const response = ModelConverter.toGeminiStreamTextResponse(chunk);
            if (response) {
              yield response;
            }
          }
        })();
      } catch (error) {
        console.error('[CustomLLM] streamObject error:', error);
        throw new Error(
          `Failed to generate streaming JSON content: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      // Use streamText for regular text output
      try {
        const stream = streamText({
          model: this.model(this.modelName),
          messages,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
          tools: ModelConverter.toAiSDKTools(request.config?.tools),
        });

        return (async function* (): AsyncGenerator<GenerateContentResponse> {
          for await (const chunk of stream.fullStream) {
            if (chunk.type === 'text-delta') {
              const response = ModelConverter.toGeminiStreamTextResponse(
                chunk.textDelta,
              );
              if (response) {
                yield response;
              }
            } else if (chunk.type === 'tool-call') {
              const response =
                ModelConverter.toGeminiStreamToolCallsResponse(chunk);
              if (response) {
                yield response;
              }
            }
          }
        })();
      } catch (error) {
        throw new Error(
          `Failed to generate streaming text content: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Asynchronously generates a complete content response.
   */
  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const messages = ModelConverter.toOpenAIMessages(request);

    // Check if this is a structured JSON output request
    const isJsonRequest =
      request.config?.responseMimeType === 'application/json' &&
      request.config?.responseSchema;

    if (isJsonRequest && request.config?.responseSchema) {
      // Use generateObject for structured JSON output
      const rawSchema = request.config.responseSchema as Record<
        string,
        unknown
      >;
      const normalizedSchema = this.normalizeSchema(rawSchema);

      try {
        const result = await generateObject({
          model: this.model(this.modelName),
          messages,
          schema: jsonSchema(normalizedSchema),
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
        });

        // Type assertion for the result
        const typedResult = {
          object: result.object as Record<string, unknown>,
          usage: result.usage,
          finishReason: result.finishReason,
        };

        return ModelConverter.toGeminiObjectResponse(typedResult);
      } catch (error) {
        throw new Error(
          `Failed to generate JSON content: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      // Use generateText for regular text output
      try {
        const result = await generateText({
          model: this.model(this.modelName),
          messages,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
          tools: ModelConverter.toAiSDKTools(request.config?.tools), // add tools to the request
        });

        return ModelConverter.toGeminiResponse(result);
      } catch (error) {
        throw new Error(
          `Failed to generate text content: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Counts the total number of tokens in the given request contents.
   */
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const messages = ModelConverter.toOpenAIMessages(request);
    const text = messages.map((m) => m.content).join(' ');
    const englishWords = (text.match(/[a-zA-Z]+[']?[a-zA-Z]*/g) || []).length;
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const numbers = (text.match(/\b\d+\b/g) || []).length;
    const punctuations = (
      text.match(/[.,!?;:"'(){}[\]<>@#$%^&*\-_+=~`|\\/]/g) || []
    ).length;
    const spaces = Math.ceil((text.match(/\s+/g) || []).length / 5);
    const totalTokens = Math.ceil(
      englishWords * 1.2 +
        chineseChars * 1 +
        numbers * 0.8 +
        punctuations * 0.5 +
        spaces,
    );
    return {
      totalTokens,
    };
  }

  /**
   * This function has not been implemented yet.
   */
  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }
}
