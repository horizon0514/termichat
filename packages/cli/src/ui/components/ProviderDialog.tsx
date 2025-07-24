/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { InputField, InputFieldType } from './shared/InputField.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useBracketedPaste } from '../hooks/useBracketedPaste.js';
import {
  LLMProviderConfig,
  LLMProviderType,
  createDefaultProviderConfig,
  validateLLMProviderConfig,
  PROVIDER_DISPLAY_NAMES,
  DEFAULT_PROVIDER_BASE_URLS,
} from 'yakchat-core';

export interface ProviderDialogProps {
  /** Called when provider is saved */
  onSave: (config: LLMProviderConfig) => void;
  /** Called when dialog is cancelled */
  onCancel: () => void;
  /** Initial provider configuration (for editing) */
  initialConfig?: Partial<LLMProviderConfig>;
  /** Whether this is an edit operation */
  isEdit?: boolean;
}

enum DialogStep {
  PROVIDER_TYPE = 'provider_type',
  PROVIDER_NAME = 'provider_name',
  API_KEY = 'api_key',
  BASE_URL = 'base_url',
  CONFIRMATION = 'confirmation',
}

export const ProviderDialog: React.FC<ProviderDialogProps> = ({
  onSave,
  onCancel,
  initialConfig = {},
  isEdit = false,
}) => {
  useBracketedPaste(); // Enable paste functionality

  const [currentStep, setCurrentStep] = useState<DialogStep>(
    isEdit ? DialogStep.API_KEY : DialogStep.PROVIDER_TYPE,
  );
  const [providerType, setProviderType] = useState<LLMProviderType>(
    initialConfig.type || LLMProviderType.OPENROUTER,
  );
  const [providerName, setProviderName] = useState(initialConfig.name || '');
  const [apiKey, setApiKey] = useState(initialConfig.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(initialConfig.baseUrl || '');
  const [error, setError] = useState<string | null>(null);

  // Available provider types
  const providerTypeItems = Object.entries(PROVIDER_DISPLAY_NAMES).map(
    ([type, displayName]) => ({
      label: displayName,
      value: type as LLMProviderType,
    }),
  );

  const handleProviderTypeSelect = (selectedType: LLMProviderType) => {
    setProviderType(selectedType);
    setBaseUrl(DEFAULT_PROVIDER_BASE_URLS[selectedType]);
    setCurrentStep(DialogStep.PROVIDER_NAME);
  };

  const handleProviderNameSubmit = (name: string) => {
    if (!name.trim()) {
      setError('Provider name is required');
      return;
    }
    setProviderName(name.trim());
    setError(null);
    setCurrentStep(DialogStep.API_KEY);
  };

  const handleApiKeySubmit = (key: string) => {
    if (!key.trim()) {
      setError('API key is required');
      return;
    }
    setApiKey(key.trim());
    setError(null);
    setCurrentStep(DialogStep.BASE_URL);
  };

  const handleBaseUrlSubmit = (url: string) => {
    setBaseUrl(url.trim());
    setError(null);
    setCurrentStep(DialogStep.CONFIRMATION);
  };

  const handleConfirmation = () => {
    const config = createDefaultProviderConfig(
      providerType,
      providerName,
      apiKey,
      baseUrl || undefined,
    );

    const validationError = validateLLMProviderConfig(config);
    if (validationError) {
      setError(validationError);
      return;
    }

    onSave(config);
  };

  const handleCancel = () => {
    setError(null);
    onCancel();
  };

  const handleBack = () => {
    setError(null);
    switch (currentStep) {
      case DialogStep.PROVIDER_NAME:
        setCurrentStep(DialogStep.PROVIDER_TYPE);
        break;
      case DialogStep.API_KEY:
        setCurrentStep(isEdit ? DialogStep.API_KEY : DialogStep.PROVIDER_NAME);
        break;
      case DialogStep.BASE_URL:
        setCurrentStep(DialogStep.API_KEY);
        break;
      case DialogStep.CONFIRMATION:
        setCurrentStep(DialogStep.BASE_URL);
        break;
      default:
        // Stay on current step if no specific handler
        break;
    }
  };

  useInput((input, key) => {
    if (key.backspace && key.ctrl) {
      // Ctrl+Backspace to go back
      if (
        currentStep !== (isEdit ? DialogStep.API_KEY : DialogStep.PROVIDER_TYPE)
      ) {
        handleBack();
      }
    }
  });

  const renderStep = () => {
    switch (currentStep) {
      case DialogStep.PROVIDER_TYPE:
        return (
          <Box flexDirection="column">
            <Text bold color={Colors.AccentPurple}>
              Select Provider Type:
            </Text>
            <Box marginTop={1}>
              <RadioButtonSelect
                items={providerTypeItems}
                initialIndex={providerTypeItems.findIndex(
                  (item) => item.value === providerType,
                )}
                onSelect={handleProviderTypeSelect}
                isFocused={true}
              />
            </Box>
          </Box>
        );

      case DialogStep.PROVIDER_NAME:
        return (
          <Box flexDirection="column">
            <Text bold color={Colors.AccentPurple}>
              Provider Name:
            </Text>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                Choose a unique name for this{' '}
                {PROVIDER_DISPLAY_NAMES[providerType]} provider
              </Text>
            </Box>
            <Box marginTop={1}>
              <InputField
                label="Name"
                placeholder="e.g., openrouter-primary"
                initialValue={providerName}
                required={true}
                onSubmit={handleProviderNameSubmit}
                onCancel={handleCancel}
                validate={(value) => {
                  if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
                    return 'Name can only contain letters, numbers, hyphens, and underscores';
                  }
                  return null;
                }}
              />
            </Box>
          </Box>
        );

      case DialogStep.API_KEY:
        return (
          <Box flexDirection="column">
            <Text bold color={Colors.AccentPurple}>
              API Key:
            </Text>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                Enter your {PROVIDER_DISPLAY_NAMES[providerType]} API key
              </Text>
            </Box>
            <Box marginTop={1}>
              <InputField
                label="API Key"
                type={InputFieldType.PASSWORD}
                placeholder="Enter your API key"
                initialValue={apiKey}
                required={true}
                onSubmit={handleApiKeySubmit}
                onCancel={handleCancel}
              />
            </Box>
          </Box>
        );

      case DialogStep.BASE_URL:
        return (
          <Box flexDirection="column">
            <Text bold color={Colors.AccentPurple}>
              Base URL (Optional):
            </Text>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                Custom base URL for {PROVIDER_DISPLAY_NAMES[providerType]} API
              </Text>
              <Text color={Colors.Gray}>
                Leave empty to use default:{' '}
                {DEFAULT_PROVIDER_BASE_URLS[providerType]}
              </Text>
            </Box>
            <Box marginTop={1}>
              <InputField
                label="Base URL"
                type={InputFieldType.URL}
                placeholder={DEFAULT_PROVIDER_BASE_URLS[providerType]}
                initialValue={baseUrl}
                required={false}
                onSubmit={handleBaseUrlSubmit}
                onCancel={handleCancel}
              />
            </Box>
          </Box>
        );

      case DialogStep.CONFIRMATION:
        return (
          <Box flexDirection="column">
            <Text bold color={Colors.AccentPurple}>
              Confirm Configuration:
            </Text>
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text bold color={Colors.LightBlue}>
                  Provider Type:{' '}
                </Text>
                <Text>{PROVIDER_DISPLAY_NAMES[providerType]}</Text>
              </Box>
              <Box>
                <Text bold color={Colors.LightBlue}>
                  Name:{' '}
                </Text>
                <Text>{providerName}</Text>
              </Box>
              <Box>
                <Text bold color={Colors.LightBlue}>
                  API Key:{' '}
                </Text>
                <Text>{'*'.repeat(8)}</Text>
              </Box>
              <Box>
                <Text bold color={Colors.LightBlue}>
                  Base URL:{' '}
                </Text>
                <Text>
                  {baseUrl || DEFAULT_PROVIDER_BASE_URLS[providerType]}
                </Text>
              </Box>
            </Box>
            <Box marginTop={2}>
              <Text color={Colors.Gray}>
                Press Enter to save, Ctrl+Backspace to go back, Esc to cancel
              </Text>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  useInput((input, key) => {
    if (currentStep === DialogStep.CONFIRMATION) {
      if (key.return) {
        handleConfirmation();
      } else if (key.escape) {
        handleCancel();
      }
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={Colors.Foreground}>
          {isEdit ? 'Edit' : 'Add'} LLM Provider
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column">{renderStep()}</Box>

      {/* Error */}
      {error && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>⚠ {error}</Text>
        </Box>
      )}

      {/* Navigation hint */}
      {currentStep !==
        (isEdit ? DialogStep.API_KEY : DialogStep.PROVIDER_TYPE) &&
        currentStep !== DialogStep.CONFIRMATION && (
          <Box marginTop={1}>
            <Text color={Colors.Gray}>
              Use Ctrl+Backspace to go back, Esc to cancel
            </Text>
          </Box>
        )}
    </Box>
  );
};
