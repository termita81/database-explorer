<script setup lang="ts">
import { NConfigProvider, NAlert } from 'naive-ui';
import { onMounted, onUnmounted } from 'vue';
import {
  Database,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Search,
} from 'lucide-vue-next';
import { useRouter, useRoute } from 'vue-router';
import { useWorkspace } from './store';
import { useConnectionActions } from './actions';
const router = useRouter();
const route = useRoute();
const workspace = useWorkspace();
const { openFile } = useConnectionActions();
function dragover(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
}
function drop(event: DragEvent) {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  void openFile(event.dataTransfer.files[0]);
}
function shortcut(event: KeyboardEvent) {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'k' &&
    route.params.connectionId
  ) {
    event.preventDefault();
    workspace.paletteOpen = !workspace.paletteOpen;
  }
}
onMounted(() => {
  window.addEventListener('keydown', shortcut);
  window.addEventListener('dragover', dragover);
  window.addEventListener('drop', drop);
});
onUnmounted(() => {
  window.removeEventListener('keydown', shortcut);
  window.removeEventListener('dragover', dragover);
  window.removeEventListener('drop', drop);
});
</script>
<template>
  <NConfigProvider
    :theme-overrides="{
      common: {
        primaryColor: '#4357d9',
        primaryColorHover: '#5367e9',
        primaryColorPressed: '#3446bc',
        borderRadius: '8px',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      },
    }"
  >
    <header class="app-header">
      <RouterLink to="/" class="brand" aria-label="DB Explorer home"
        ><span class="brand-mark"><Database :size="20" /></span> DB
        Explorer</RouterLink
      >
      <div class="history-controls">
        <button class="icon-button" aria-label="Go back" @click="router.back()">
          <ArrowLeft :size="18" /></button
        ><button
          class="icon-button"
          aria-label="Go forward"
          @click="router.forward()"
        >
          <ArrowRight :size="18" />
        </button>
      </div>
      <button
        v-if="route.params.connectionId"
        class="palette-trigger"
        @click="workspace.paletteOpen = true"
      >
        <Search :size="16" /> Jump to a table <kbd>⌘ / Ctrl K</kbd>
      </button>
      <span class="readonly"><ShieldCheck :size="15" /> Read-only</span>
    </header>
    <NAlert
      v-if="workspace.connectionError"
      class="global-alert"
      title="Could not open database"
      type="error"
      closable
      @close="workspace.connectionError = ''"
      >{{ workspace.connectionError }}</NAlert
    >
    <NAlert v-if="workspace.storageError" class="global-alert" type="warning">{{
      workspace.storageError
    }}</NAlert>
    <RouterView />
  </NConfigProvider>
</template>
