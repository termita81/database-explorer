import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TableRef } from '@db-explorer/core';
export interface Profile {
  name: string;
  kind: 'path' | 'file';
  path?: string;
}
function loadProfiles(key: string): Profile[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (profile): profile is Profile =>
          profile &&
          typeof profile.name === 'string' &&
          (profile.kind === 'file' ||
            (profile.kind === 'path' && typeof profile.path === 'string')),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}
export const useWorkspace = defineStore('workspace', () => {
  const tabs = ref<Record<string, TableRef[]>>({});
  const paletteOpen = ref(false);
  const opening = ref(false);
  const connectionError = ref('');
  const recent = ref(loadProfiles('db-explorer.recent'));
  const saved = ref(loadProfiles('db-explorer.saved'));
  const storageError = ref('');
  function persist(key: string, profiles: Profile[]) {
    try {
      localStorage.setItem(key, JSON.stringify(profiles));
      storageError.value = '';
    } catch {
      storageError.value =
        'Browser storage is unavailable. Connections will not be remembered.';
    }
  }
  function remember(profile: Profile, save = false) {
    const different = (other: Profile) =>
      !(
        profile.kind === other.kind &&
        (profile.path ?? profile.name) === (other.path ?? other.name)
      );
    recent.value = [profile, ...recent.value.filter(different)].slice(0, 8);
    persist('db-explorer.recent', recent.value);
    if (save) {
      saved.value = [profile, ...saved.value.filter(different)].slice(0, 20);
      persist('db-explorer.saved', saved.value);
    }
  }
  function forget(profile: Profile) {
    saved.value = saved.value.filter((item) => item !== profile);
    persist('db-explorer.saved', saved.value);
  }
  function addTab(id: string, table: TableRef) {
    const open = tabs.value[id] ?? [];
    if (
      !open.some(
        (item) => item.schema === table.schema && item.name === table.name,
      )
    )
      tabs.value[id] = [...open, table];
  }
  function closeTab(id: string, table: TableRef) {
    tabs.value[id] = (tabs.value[id] ?? []).filter(
      (item) => item.schema !== table.schema || item.name !== table.name,
    );
  }
  return {
    tabs,
    paletteOpen,
    opening,
    connectionError,
    recent,
    saved,
    storageError,
    remember,
    forget,
    addTab,
    closeTab,
  };
});
