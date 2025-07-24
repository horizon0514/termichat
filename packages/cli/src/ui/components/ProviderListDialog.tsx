/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LLMProviderConfig } from 'yak-core';

export interface ProviderListDialogProps {
  /** List of configured providers */
  providers: Record<string, LLMProviderConfig>;
  /** Current default provider name */
  defaultProvider?: string;
  /** Called when a provider is selected for editing */
  onEdit: (providerName: string, config: LLMProviderConfig) => void;
  /** Called when a provider is selected for deletion */
  onDelete: (providerName: string) => void;
  /** Called when a provider is set as default */
  onSetDefault: (providerName: string) => void;
  /** Called when dialog is cancelled */
  onCancel: () => void;
  /** Called when user wants to add a new provider */
  onAddNew: () => void;
}

enum DialogAction {
  EDIT = 'edit',
  DELETE = 'delete',
  SET_DEFAULT = 'set_default',
  ADD_NEW = 'add_new',
  CANCEL = 'cancel',
}

interface ActionItem {
  label: string;
  value: DialogAction;
  providerName?: string;
  disabled?: boolean;
}

export const ProviderListDialog: React.FC<ProviderListDialogProps> = ({
  providers,
  defaultProvider,
  onEdit,
  onDelete,
  onSetDefault,
  onCancel,
  onAddNew,
}) => {
  const [selectedIndex, _setSelectedIndex] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<{
    action: DialogAction;
    providerName?: string;
  } | null>(null);

  const providerEntries = Object.entries(providers);
  const hasProviders = providerEntries.length > 0;

  // Build action items for each provider
  const actionItems: ActionItem[] = [];

  if (hasProviders) {
    providerEntries.forEach(([name, config]) => {
      const isDefault = name === defaultProvider;
      const prefix = isDefault ? '★ ' : '  ';
      const status = config.enabled ? '✓' : '✗';

      actionItems.push({
        label: `${prefix}${status} ${config.displayName} (${name})`,
        value: DialogAction.EDIT,
        providerName: name,
      });
    });

    actionItems.push({
      label: '─────────────────────────',
      value: DialogAction.CANCEL,
      disabled: true,
    });
  }

  actionItems.push({
    label: hasProviders ? '+ Add New Provider' : '+ Add Your First Provider',
    value: DialogAction.ADD_NEW,
  });

  actionItems.push({
    label: 'Cancel',
    value: DialogAction.CANCEL,
  });

  const handleSelection = (item: ActionItem) => {
    if (item.disabled) return;

    switch (item.value) {
      case DialogAction.EDIT:
        if (item.providerName && providers[item.providerName]) {
          onEdit(item.providerName, providers[item.providerName]);
        }
        break;
      case DialogAction.ADD_NEW:
        onAddNew();
        break;
      case DialogAction.CANCEL:
        onCancel();
        break;
      default:
        // No action for unhandled cases
        break;
    }
  };

  const handleSecondaryAction = (
    action: DialogAction,
    providerName?: string,
  ) => {
    if (action === DialogAction.DELETE && providerName) {
      setConfirmationAction({ action, providerName });
      setShowConfirmation(true);
    } else if (action === DialogAction.SET_DEFAULT && providerName) {
      onSetDefault(providerName);
    }
  };

  const handleConfirmation = (confirmed: boolean) => {
    if (confirmed && confirmationAction) {
      if (
        confirmationAction.action === DialogAction.DELETE &&
        confirmationAction.providerName
      ) {
        onDelete(confirmationAction.providerName);
      }
    }
    setShowConfirmation(false);
    setConfirmationAction(null);
  };

  useInput((input, key) => {
    if (showConfirmation) {
      if (key.return || input.toLowerCase() === 'y') {
        handleConfirmation(true);
      } else if (key.escape || input.toLowerCase() === 'n') {
        handleConfirmation(false);
      }
      return;
    }

    if (key.escape) {
      onCancel();
    } else if (input === 'd' && hasProviders) {
      // Delete shortcut
      const currentItem = actionItems[selectedIndex];
      if (currentItem?.providerName) {
        handleSecondaryAction(DialogAction.DELETE, currentItem.providerName);
      }
    } else if (input === 's' && hasProviders) {
      // Set default shortcut
      const currentItem = actionItems[selectedIndex];
      if (currentItem?.providerName) {
        handleSecondaryAction(
          DialogAction.SET_DEFAULT,
          currentItem.providerName,
        );
      }
    }
  });

  if (showConfirmation && confirmationAction) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.AccentRed}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Box marginBottom={1}>
          <Text bold color={Colors.AccentRed}>
            Confirm Deletion
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            Are you sure you want to delete provider &quot;
            {confirmationAction.providerName}&quot;?
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={Colors.Gray}>This action cannot be undone.</Text>
        </Box>
        <Box>
          <Text color={Colors.Gray}>
            Press Y to confirm, N or Esc to cancel
          </Text>
        </Box>
      </Box>
    );
  }

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
          Manage LLM Providers
        </Text>
      </Box>

      {/* Empty state */}
      {!hasProviders && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={Colors.Gray}>No LLM providers configured yet.</Text>
          <Text color={Colors.Gray}>
            Add your first provider to get started.
          </Text>
        </Box>
      )}

      {/* Provider list or actions */}
      <Box flexDirection="column">
        {hasProviders && (
          <Box marginBottom={1}>
            <Text color={Colors.Gray}>
              ★ = Default Provider, ✓ = Enabled, ✗ = Disabled
            </Text>
          </Box>
        )}

        <RadioButtonSelect
          items={actionItems.map((item) => ({
            label: item.label,
            value: item,
            disabled: item.disabled,
          }))}
          initialIndex={0}
          onSelect={handleSelection}
          isFocused={true}
        />
      </Box>

      {/* Help text */}
      <Box marginTop={1} flexDirection="column">
        {hasProviders && (
          <>
            <Text color={Colors.Gray}>
              Actions: Enter = Edit, D = Delete, S = Set Default
            </Text>
            <Text color={Colors.Gray}>Use ↑↓ to navigate, Esc to cancel</Text>
          </>
        )}
        {!hasProviders && (
          <Text color={Colors.Gray}>
            Use Enter to add a provider, Esc to cancel
          </Text>
        )}
      </Box>
    </Box>
  );
};
