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
import { generateText, streamText, generateObject, streamObject, jsonSchema } from 'ai';
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
    // Validate required environment variables
    this.validateConfiguration();
    
    this.model = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });
    
    // Debug logging for configuration
    console.debug('[CustomLLM] Configuration:', {
      modelName: this.modelName,
      baseURL: this.baseURL,
      hasApiKey: !!this.apiKey,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      topP: this.topP,
    });
  }

  /**
   * Validates that all required environment variables are set
   */
  private validateConfiguration(): void {
    const missingVars: string[] = [];
    
    if (!this.apiKey) {
      missingVars.push('CUSTOM_LLM_API_KEY');
    }
    
    if (!this.baseURL) {
      missingVars.push('CUSTOM_LLM_BASE_URL');
    }
    
    if (!this.modelName) {
      missingVars.push('CUSTOM_LLM_MODEL_NAME');
    }
    
    if (missingVars.length > 0) {
      const errorMessage = [
        '❌ Custom LLM 配置不完整！缺少以下环境变量：',
        '',
        ...missingVars.map(varName => `  • ${varName}`),
        '',
        '📋 请设置以下环境变量：',
        '',
        '# 示例配置',
        'export CUSTOM_LLM_API_KEY="your-api-key"',
        'export CUSTOM_LLM_BASE_URL="https://api.your-provider.com/v1"  # 兼容 OpenAI API 的端点',
        'export CUSTOM_LLM_MODEL_NAME="gpt-4"  # 或者您的模型名称',
        '',
        '# 可选配置（有默认值）',
        'export CUSTOM_LLM_TEMPERATURE="0"',
        'export CUSTOM_LLM_MAX_TOKENS="8192"',
        'export CUSTOM_LLM_TOP_P="1"',
        '',
        '🔧 支持的提供商：',
        '  • OpenAI 兼容的 API 端点',
        '  • Azure OpenAI',
        '  • 本地部署的模型（如 Ollama、LM Studio 等）',
        '  • 其他支持 OpenAI API 格式的服务',
      ].join('\n');
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Normalizes a schema to ensure it has proper type declarations for use with Vercel AI SDK
   */
  private normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
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
          normalizedProperties[key] = this.normalizeSchema(value as Record<string, unknown>);
        } else {
          normalizedProperties[key] = value;
        }
      }
      normalized.properties = normalizedProperties;
    }
    
    // Handle arrays
    if (normalized.items && typeof normalized.items === 'object') {
      normalized.items = this.normalizeSchema(normalized.items as Record<string, unknown>);
    }
    
    // Handle anyOf/oneOf
    if (Array.isArray(normalized.anyOf)) {
      normalized.anyOf = normalized.anyOf.map(item => 
        typeof item === 'object' && item !== null ? this.normalizeSchema(item as Record<string, unknown>) : item
      );
    }
    
    if (Array.isArray(normalized.oneOf)) {
      normalized.oneOf = normalized.oneOf.map(item => 
        typeof item === 'object' && item !== null ? this.normalizeSchema(item as Record<string, unknown>) : item
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
    const isJsonRequest = request.config?.responseMimeType === 'application/json' && 
                         request.config?.responseSchema;
    
    console.debug('[CustomLLM] generateContentStream:', {
      isJsonRequest,
      messageCount: messages.length,
      hasSchema: !!request.config?.responseSchema,
      responseMimeType: request.config?.responseMimeType,
    });
    
    if (isJsonRequest && request.config?.responseSchema) {
      // Use streamObject for structured JSON output
      const rawSchema = request.config.responseSchema as Record<string, unknown>;
      const normalizedSchema = this.normalizeSchema(rawSchema);
      
      console.debug('[CustomLLM] Using streamObject for JSON output');
      console.debug('[CustomLLM] Raw schema:', rawSchema);
      console.debug('[CustomLLM] Normalized schema:', normalizedSchema);
      
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
        throw new Error(`Failed to generate streaming JSON content: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Use streamText for regular text output
      console.debug('[CustomLLM] Using streamText for regular output');
      
      try {
        const stream = streamText({
          model: this.model(this.modelName),
          messages,
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
        console.error('[CustomLLM] streamText error:', error);
        throw new Error(`Failed to generate streaming text content: ${error instanceof Error ? error.message : String(error)}`);
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
    const isJsonRequest = request.config?.responseMimeType === 'application/json' && 
                         request.config?.responseSchema;
    
    console.debug('[CustomLLM] generateContent:', {
      isJsonRequest,
      messageCount: messages.length,
      hasSchema: !!request.config?.responseSchema,
      responseMimeType: request.config?.responseMimeType,
    });
    
    if (isJsonRequest && request.config?.responseSchema) {
      // Use generateObject for structured JSON output
      const rawSchema = request.config.responseSchema as Record<string, unknown>;
      const normalizedSchema = this.normalizeSchema(rawSchema);
      
      console.debug('[CustomLLM] Using generateObject for JSON output');
      console.debug('[CustomLLM] Raw schema:', rawSchema);
      console.debug('[CustomLLM] Normalized schema:', normalizedSchema);
      
      try {
        const result = await generateObject({
          model: this.model(this.modelName),
          messages,
          schema: jsonSchema(normalizedSchema),
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
        });

        console.debug('[CustomLLM] generateObject result:', {
          hasObject: !!result.object,
          usage: result.usage,
        });

        // Type assertion for the result
        const typedResult = {
          object: result.object as Record<string, unknown>,
          usage: result.usage,
          finishReason: result.finishReason,
        };
        
        return ModelConverter.toGeminiObjectResponse(typedResult);
      } catch (error) {
        console.error('[CustomLLM] generateObject error:', error);
        throw new Error(`Failed to generate JSON content: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Use generateText for regular text output
      console.debug('[CustomLLM] Using generateText for regular output');
      
      try {
        const result = await generateText({
          model: this.model(this.modelName),
          messages,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          topP: this.topP,
        });

        console.debug('[CustomLLM] generateText result:', {
          hasText: !!result.text,
          usage: result.usage,
        });

        return ModelConverter.toGeminiResponse(result);
      } catch (error) {
        console.error('[CustomLLM] generateText error:', error);
        throw new Error(`Failed to generate text content: ${error instanceof Error ? error.message : String(error)}`);
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
