/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported LLM Provider types
 */
export enum LLMProviderType {
  OPENROUTER = 'openrouter',
}

/**
 * Configuration for an LLM Provider
 */
export interface LLMProviderConfig {
  /** Unique identifier for the provider */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Provider type (determines API format) */
  type: LLMProviderType;
  /** API key for authentication (required) */
  apiKey: string;
  /** Custom base URL (optional, uses default if not provided) */
  baseUrl?: string;
  /** Whether this is the default provider */
  isDefault?: boolean;
  /** Whether this provider is enabled */
  enabled?: boolean;
}

/**
 * Default base URLs for different provider types
 */
export const DEFAULT_PROVIDER_BASE_URLS: Record<LLMProviderType, string> = {
  [LLMProviderType.OPENROUTER]: 'https://openrouter.ai/api/v1',
};

/**
 * Default display names for provider types
 */
export const PROVIDER_DISPLAY_NAMES: Record<LLMProviderType, string> = {
  [LLMProviderType.OPENROUTER]: 'OpenRouter',
};

/**
 * Validates an LLM Provider configuration
 * @param config The provider configuration to validate
 * @returns Error message if invalid, null if valid
 */
export function validateLLMProviderConfig(
  config: Partial<LLMProviderConfig>,
): string | null {
  if (!config.name || config.name.trim() === '') {
    return 'Provider name is required';
  }

  if (!config.type || !Object.values(LLMProviderType).includes(config.type)) {
    return 'Valid provider type is required';
  }

  if (!config.apiKey || config.apiKey.trim() === '') {
    return 'API key is required';
  }

  if (config.baseUrl) {
    try {
      new URL(config.baseUrl);
    } catch {
      return 'Base URL must be a valid URL';
    }
  }

  return null;
}

/**
 * Creates a default provider configuration for a given type
 * @param type The provider type
 * @param name The provider name
 * @param apiKey The API key
 * @param baseUrl Optional custom base URL
 * @returns Default provider configuration
 */
export function createDefaultProviderConfig(
  type: LLMProviderType,
  name: string,
  apiKey: string,
  baseUrl?: string,
): LLMProviderConfig {
  return {
    name: name.trim(),
    displayName: PROVIDER_DISPLAY_NAMES[type],
    type,
    apiKey: apiKey.trim(),
    baseUrl: baseUrl?.trim() || DEFAULT_PROVIDER_BASE_URLS[type],
    isDefault: false,
    enabled: true,
  };
}

/**
 * Gets the effective base URL for a provider configuration
 * @param config The provider configuration
 * @returns The base URL to use for API calls
 */
export function getProviderBaseUrl(config: LLMProviderConfig): string {
  return config.baseUrl || DEFAULT_PROVIDER_BASE_URLS[config.type];
}
