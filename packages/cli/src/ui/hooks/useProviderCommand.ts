/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { LLMProviderConfig } from 'yak-core';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

export interface UseProviderCommandReturn {
  /** Whether the provider dialog is open */
  isProviderDialogOpen: boolean;
  /** Whether the provider list dialog is open */
  isProviderListDialogOpen: boolean;
  /** Current provider being edited (undefined for new provider) */
  editingProvider: { name: string; config: LLMProviderConfig } | undefined;
  /** Open provider dialog for adding new provider */
  openAddProviderDialog: () => void;
  /** Open provider dialog for editing existing provider */
  openEditProviderDialog: (name: string, config: LLMProviderConfig) => void;
  /** Open provider list dialog */
  openProviderListDialog: () => void;
  /** Close all dialogs */
  closeDialogs: () => void;
  /** Save provider configuration */
  saveProvider: (config: LLMProviderConfig) => void;
  /** Delete provider */
  deleteProvider: (name: string) => void;
  /** Set default provider */
  setDefaultProvider: (name: string) => void;
}

export const useProviderCommand = (
  settings: LoadedSettings,
): UseProviderCommandReturn => {
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
  const [isProviderListDialogOpen, setIsProviderListDialogOpen] =
    useState(false);
  const [editingProvider, setEditingProvider] = useState<
    | {
        name: string;
        config: LLMProviderConfig;
      }
    | undefined
  >(undefined);

  const openAddProviderDialog = useCallback(() => {
    setEditingProvider(undefined);
    setIsProviderDialogOpen(true);
    setIsProviderListDialogOpen(false);
  }, []);

  const openEditProviderDialog = useCallback(
    (name: string, config: LLMProviderConfig) => {
      setEditingProvider({ name, config });
      setIsProviderDialogOpen(true);
      setIsProviderListDialogOpen(false);
    },
    [],
  );

  const openProviderListDialog = useCallback(() => {
    setIsProviderListDialogOpen(true);
    setIsProviderDialogOpen(false);
    setEditingProvider(undefined);
  }, []);

  const closeDialogs = useCallback(() => {
    setIsProviderDialogOpen(false);
    setIsProviderListDialogOpen(false);
    setEditingProvider(undefined);
  }, []);

  const saveProvider = useCallback(
    (config: LLMProviderConfig) => {
      const existingProviders = settings.merged.llmProviders || {};
      const updatedProviders = {
        ...existingProviders,
        [config.name]: config,
      };

      // If this is the first provider, make it the default
      const shouldSetAsDefault = Object.keys(existingProviders).length === 0;

      settings.setValue(SettingScope.User, 'llmProviders', updatedProviders);

      if (shouldSetAsDefault) {
        settings.setValue(SettingScope.User, 'defaultLLMProvider', config.name);
      }

      closeDialogs();
    },
    [settings, closeDialogs],
  );

  const deleteProvider = useCallback(
    (name: string) => {
      const existingProviders = settings.merged.llmProviders || {};
      const updatedProviders = { ...existingProviders };
      delete updatedProviders[name];

      settings.setValue(SettingScope.User, 'llmProviders', updatedProviders);

      // If this was the default provider, clear the default
      if (settings.merged.defaultLLMProvider === name) {
        settings.setValue(SettingScope.User, 'defaultLLMProvider', undefined);
      }

      closeDialogs();
    },
    [settings, closeDialogs],
  );

  const setDefaultProvider = useCallback(
    (name: string) => {
      settings.setValue(SettingScope.User, 'defaultLLMProvider', name);
      closeDialogs();
    },
    [settings, closeDialogs],
  );

  return {
    isProviderDialogOpen,
    isProviderListDialogOpen,
    editingProvider,
    openAddProviderDialog,
    openEditProviderDialog,
    openProviderListDialog,
    closeDialogs,
    saveProvider,
    deleteProvider,
    setDefaultProvider,
  };
};
