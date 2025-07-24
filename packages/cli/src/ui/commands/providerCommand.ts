/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import { MessageType } from '../types.js';
import { PROVIDER_DISPLAY_NAMES } from 'termichat-core';
import { SettingScope } from '../../config/settings.js';

/**
 * Lists all configured LLM providers
 */
const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'List all configured LLM providers',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    const providers = context.services.settings.merged.llmProviders || {};
    const defaultProvider = context.services.settings.merged.defaultLLMProvider;

    if (Object.keys(providers).length === 0) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: 'No LLM providers configured.\n\nUse "/provider add <name>" to add a new provider.',
        },
        Date.now(),
      );
      return;
    }

    let message = 'Configured LLM Providers:\n\n';
    Object.entries(providers).forEach(([name, config]) => {
      const isDefault = name === defaultProvider;
      const status = config.enabled ? '✓' : '✗';
      const defaultMark = isDefault ? ' (default)' : '';

      message += `  ${status} \u001b[36m${config.displayName}\u001b[0m (${name})${defaultMark}\n`;
      message += `    Type: ${config.type}\n`;
      message += `    Base URL: ${config.baseUrl || 'Default'}\n`;
      message += `    API Key: ${'*'.repeat(8)}\n\n`;
    });

    message += 'Commands:\n';
    message += '  /provider add <name>      - Add a new provider\n';
    message += '  /provider edit <name>     - Edit an existing provider\n';
    message += '  /provider remove <name>   - Remove a provider\n';
    message += '  /provider set-default <name> - Set default provider\n';

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
};

/**
 * Adds a new LLM provider configuration
 */
const addSubCommand: SlashCommand = {
  name: 'add',
  description: 'Add a new LLM provider',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn | void> => {
    const providerName = args.trim();

    if (!providerName) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Usage: /provider add <name>\n\nExample: /provider add my-openrouter',
      };
    }

    const existingProviders =
      context.services.settings.merged.llmProviders || {};

    if (existingProviders[providerName]) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Provider "${providerName}" already exists. Use "/provider edit ${providerName}" to modify it.`,
      };
    }

    // For now, we only support OpenRouter, but this can be extended
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Adding new OpenRouter provider: "${providerName}"\n\nPlease provide the following information:`,
      },
      Date.now(),
    );

    // Open the provider dialog to add new provider
    return {
      type: 'dialog',
      dialog: 'provider',
    };
  },
  completion: async (
    context: CommandContext,
    partialArg: string,
  ): Promise<string[]> => {
    // Could provide suggestions for common provider names
    if (partialArg.length === 0) {
      return ['openrouter-primary', 'openrouter-backup'];
    }
    return [];
  },
};

/**
 * Edits an existing LLM provider configuration
 */
const editSubCommand: SlashCommand = {
  name: 'edit',
  description: 'Edit an existing LLM provider',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn | void> => {
    const providerName = args.trim();

    if (!providerName) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Usage: /provider edit <name>\n\nUse "/provider list" to see available providers.',
      };
    }

    const existingProviders =
      context.services.settings.merged.llmProviders || {};

    if (!existingProviders[providerName]) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Provider "${providerName}" not found. Use "/provider list" to see available providers.`,
      };
    }

    // Open the provider list dialog, which can then open edit dialog
    return {
      type: 'dialog',
      dialog: 'provider-list',
    };
  },
  completion: async (
    context: CommandContext,
    partialArg: string,
  ): Promise<string[]> => {
    const providers = context.services.settings.merged.llmProviders || {};
    const providerNames = Object.keys(providers);

    if (partialArg.length === 0) {
      return providerNames;
    }

    return providerNames.filter((name) =>
      name.toLowerCase().startsWith(partialArg.toLowerCase()),
    );
  },
};

/**
 * Removes an LLM provider configuration
 */
const removeSubCommand: SlashCommand = {
  name: 'remove',
  description: 'Remove an LLM provider',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn | void> => {
    const providerName = args.trim();

    if (!providerName) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Usage: /provider remove <name>\n\nUse "/provider list" to see available providers.',
      };
    }

    const existingProviders =
      context.services.settings.merged.llmProviders || {};

    if (!existingProviders[providerName]) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Provider "${providerName}" not found. Use "/provider list" to see available providers.`,
      };
    }

    // Check if this is the default provider
    const defaultProvider = context.services.settings.merged.defaultLLMProvider;
    const isDefault = providerName === defaultProvider;

    // Remove the provider
    const updatedProviders = { ...existingProviders };
    delete updatedProviders[providerName];

    // Update the settings
    context.services.settings.setValue(
      SettingScope.User,
      'llmProviders',
      updatedProviders,
    );

    // If this was the default provider, clear the default
    if (isDefault) {
      context.services.settings.setValue(
        SettingScope.User,
        'defaultLLMProvider',
        undefined,
      );
    }

    let message = `Provider "${providerName}" removed successfully.`;
    if (isDefault) {
      message +=
        '\n\nThis was your default provider. Use "/provider set-default <name>" to set a new default.';
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
  completion: async (
    context: CommandContext,
    partialArg: string,
  ): Promise<string[]> => {
    const providers = context.services.settings.merged.llmProviders || {};
    const providerNames = Object.keys(providers);

    if (partialArg.length === 0) {
      return providerNames;
    }

    return providerNames.filter((name) =>
      name.toLowerCase().startsWith(partialArg.toLowerCase()),
    );
  },
};

/**
 * Sets the default LLM provider
 */
const setDefaultSubCommand: SlashCommand = {
  name: 'set-default',
  description: 'Set the default LLM provider',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn | void> => {
    const providerName = args.trim();

    if (!providerName) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Usage: /provider set-default <name>\n\nUse "/provider list" to see available providers.',
      };
    }

    const existingProviders =
      context.services.settings.merged.llmProviders || {};

    if (!existingProviders[providerName]) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Provider "${providerName}" not found. Use "/provider list" to see available providers.`,
      };
    }

    const provider = existingProviders[providerName];

    if (!provider.enabled) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Provider "${providerName}" is disabled. Enable it first before setting as default.`,
      };
    }

    // Set as default
    context.services.settings.setValue(
      SettingScope.User,
      'defaultLLMProvider',
      providerName,
    );

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `"${provider.displayName}" (${providerName}) is now the default LLM provider.`,
      },
      Date.now(),
    );
  },
  completion: async (
    context: CommandContext,
    partialArg: string,
  ): Promise<string[]> => {
    const providers = context.services.settings.merged.llmProviders || {};
    const enabledProviders = Object.entries(providers)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);

    if (partialArg.length === 0) {
      return enabledProviders;
    }

    return enabledProviders.filter((name) =>
      name.toLowerCase().startsWith(partialArg.toLowerCase()),
    );
  },
};

/**
 * Shows available provider types
 */
const typesSubCommand: SlashCommand = {
  name: 'types',
  description: 'List available LLM provider types',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    let message = 'Available LLM Provider Types:\n\n';

    Object.entries(PROVIDER_DISPLAY_NAMES).forEach(([type, displayName]) => {
      message += `  \u001b[36m${displayName}\u001b[0m (${type})\n`;
    });

    message += '\nCurrently supported: OpenRouter\n';
    message += 'More providers will be added in future updates.';

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  },
};

/**
 * Main provider command with subcommands
 */
export const providerCommand: SlashCommand = {
  name: 'provider',
  description: 'Manage LLM providers',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext): Promise<void> => {
    // Default action shows the same as list
    await listSubCommand.action!(context, '');
  },
  subCommands: [
    listSubCommand,
    addSubCommand,
    editSubCommand,
    removeSubCommand,
    setDefaultSubCommand,
    typesSubCommand,
  ],
};
