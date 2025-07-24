/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { Colors } from '../../colors.js';
import { useKeypress } from '../../hooks/useKeypress.js';

export enum InputFieldType {
  TEXT = 'text',
  PASSWORD = 'password',
  URL = 'url',
}

export interface InputFieldProps {
  /** Label to display above the input */
  label: string;
  /** Placeholder text */
  placeholder?: string;
  /** Input type */
  type?: InputFieldType;
  /** Initial value */
  initialValue?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Custom validation function */
  validate?: (value: string) => string | null;
  /** Whether the field is focused */
  isFocused?: boolean;
  /** Callback when value changes */
  onChange?: (value: string) => void;
  /** Callback when Enter is pressed */
  onSubmit?: (value: string) => void;
  /** Callback when Escape is pressed */
  onCancel?: () => void;
  /** Maximum width of the input field */
  maxWidth?: number;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  placeholder = '',
  type = InputFieldType.TEXT,
  initialValue = '',
  required = false,
  validate,
  isFocused = true,
  onChange,
  onSubmit,
  onCancel,
  maxWidth = 50,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(isFocused);

  useEffect(() => {
    setIsActive(isFocused);
  }, [isFocused]);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const validateValue = (newValue: string): string | null => {
    // Required field validation
    if (required && newValue.trim() === '') {
      return `${label} is required`;
    }

    // URL validation
    if (type === InputFieldType.URL && newValue.trim() !== '') {
      try {
        new URL(newValue.trim());
      } catch {
        return 'Please enter a valid URL';
      }
    }

    // Custom validation
    if (validate) {
      return validate(newValue);
    }

    return null;
  };

  const handleValueChange = (newValue: string) => {
    setValue(newValue);

    // Clear error when user starts typing
    if (error) {
      setError(null);
    }

    onChange?.(newValue);
  };

  const handleSubmit = () => {
    const validationError = validateValue(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    onSubmit?.(value);
    setValue('');
  };

  const handleCancel = () => {
    setError(null);
    onCancel?.();
  };

  useKeypress(
    (key) => {
      if (!isActive) return;

      if (key.name === 'return') {
        handleSubmit();
      } else if (key.name === 'escape') {
        handleCancel();
      } else if (key.name === 'backspace' || key.name === 'delete') {
        const newValue = value.slice(0, -1);
        handleValueChange(newValue);
      } else if (key.paste && key.sequence) {
        // Handle paste events (including Command+V on macOS)
        const pasteContent = key.sequence;
        const newValue = value + pasteContent;
        // Apply maxWidth limit, truncating if necessary
        const finalValue = newValue.length <= maxWidth ? newValue : newValue.slice(0, maxWidth);
        handleValueChange(finalValue);
      } else if (key.sequence && !key.ctrl && !key.meta) {
        // Handle all text input - similar to text-buffer logic
        const input = key.sequence;
        const newValue = value + input;
        if (newValue.length <= maxWidth) {
          handleValueChange(newValue);
        }
      }
    },
    { isActive },
  );

  const displayValue =
    type === InputFieldType.PASSWORD && value
      ? '*'.repeat(value.length)
      : value;

  const displayPlaceholder = placeholder ? `  ${placeholder}` : '';
  return (
    <Box flexDirection="column">
      {/* Label */}
      <Box marginBottom={1}>
        <Text bold color={Colors.Foreground}>
          {label}
          {required && <Text color={Colors.AccentRed}> *</Text>}
        </Text>
      </Box>

      {/* Input Field */}
      <Box
        borderStyle="round"
        borderColor={
          error ? Colors.AccentRed : isActive ? Colors.AccentBlue : Colors.Gray
        }
        paddingX={1}
        width={Math.min(maxWidth + 2, 60)}
      >
        {value.length === 0 && displayPlaceholder ? (
          isActive ? (
            <Text>
              {chalk.inverse(displayPlaceholder.slice(0, 1))}
              <Text color={Colors.Gray}>{displayPlaceholder.slice(1)}</Text>
            </Text>
          ) : (
            <Text color={Colors.Gray}>{displayPlaceholder}</Text>
          )
        ) : (
          <Text color={Colors.Foreground}>
            {displayValue}
            {isActive && <Text color={Colors.AccentBlue}>█</Text>}
          </Text>
        )}
      </Box>

      {/* Error Message */}
      {error && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>⚠ {error}</Text>
        </Box>
      )}

      {/* Help Text */}
      {isActive && !error && (
        <Box marginTop={1}>
          <Text color={Colors.Gray}>Press Enter to confirm, Esc to cancel</Text>
        </Box>
      )}
    </Box>
  );
};
