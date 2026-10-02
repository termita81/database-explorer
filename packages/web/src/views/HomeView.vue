<script setup lang="ts">
import { ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { NButton, NInput, NCheckbox } from 'naive-ui';
import {
  Database,
  Upload,
  FolderOpen,
  ArrowUpRight,
  Clock3,
  Bookmark,
  X,
  Plug,
} from 'lucide-vue-next';
import { api } from '../api';
import { useWorkspace, type Profile } from '../store';
import { useConnectionActions } from '../actions';
const workspace = useWorkspace();
const router = useRouter();
const queryClient = useQueryClient();
const { openFile, openPath } = useConnectionActions();
const connections = useQuery({
  queryKey: ['connections'],
  queryFn: ({ signal }) => api.connections(signal),
});
const path = ref('');
const name = ref('');
const save = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const closing = ref('');
function picked(event: Event) {
  const input = event.target as HTMLInputElement;
  void openFile(input.files?.[0]);
  input.value = '';
}
function reopen(profile: Profile) {
  if (profile.kind === 'path') void openPath(profile.path!, profile.name);
  else picker.value?.click();
}
async function close(id: string) {
  closing.value = id;
  try {
    await api.close(id);
    delete workspace.tabs[id];
    await queryClient.invalidateQueries({ queryKey: ['connections'] });
  } catch (error) {
    workspace.connectionError =
      error instanceof Error ? error.message : 'Could not close connection.';
  } finally {
    closing.value = '';
  }
}
</script>
<template>
  <main class="home-view">
    <div class="home-intro">
      <span class="eyebrow">YOUR DATA, A LITTLE CLEARER</span>
      <h1>Get to know your database.</h1>
      <p>
        Explore its structure, follow the relationships, and find your way
        around.<br />Everything stays read-only.
      </p>
    </div>
    <div class="home-connect-grid">
      <section class="file-card">
        <span class="large-icon"><Upload :size="30" /></span>
        <h2>Open a SQLite database</h2>
        <p>
          Drop a database file anywhere in the window<br />or choose one from
          your computer.
        </p>
        <NButton
          type="primary"
          size="large"
          :loading="workspace.opening"
          :disabled="workspace.opening"
          @click="picker?.click()"
          ><template #icon><FolderOpen :size="18" /></template>Choose database
          file</NButton
        >
        <input
          ref="picker"
          type="file"
          accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3"
          aria-label="Choose SQLite database"
          data-testid="database-file"
          hidden
          @change="picked"
        />
        <small>Opens a temporary read-only copy · up to 100 MB</small>
      </section>
      <section class="path-card">
        <div class="card-title">
          <FolderOpen :size="20" />
          <h2>Connect by local path</h2>
          <span class="chip">SQLite</span>
        </div>
        <p class="muted">Open the database directly on this machine.</p>
        <form @submit.prevent="openPath(path, name, save)">
          <label for="database-path">Database path</label
          ><NInput
            :input-props="{ id: 'database-path' }"
            v-model:value="path"
            placeholder="./tests/fixtures/sample.db"
            :disabled="workspace.opening"
          />
          <label for="connection-name"
            >Connection name <span class="muted">(optional)</span></label
          ><NInput
            :input-props="{ id: 'connection-name' }"
            v-model:value="name"
            placeholder="My database"
            :disabled="workspace.opening"
          />
          <div class="form-footer">
            <NCheckbox v-model:checked="save">Save in this browser</NCheckbox
            ><NButton
              attr-type="submit"
              type="primary"
              :loading="workspace.opening"
              :disabled="!path.trim() || workspace.opening"
              >Connect <ArrowUpRight :size="16"
            /></NButton>
          </div>
        </form>
      </section>
    </div>
    <section class="connection-section">
      <div class="section-title">
        <Plug :size="18" />
        <h2>Open connections</h2>
        <span class="count">{{ connections.data.value?.length ?? 0 }}</span>
      </div>
      <p v-if="connections.isPending.value" class="muted" role="status">
        Loading connections…
      </p>
      <p v-else-if="connections.error.value" class="error-message" role="alert">
        {{ connections.error.value.message }}
        <button class="text-button" @click="connections.refetch()">
          Try again
        </button>
      </p>
      <p v-else-if="!connections.data.value?.length" class="empty-line">
        No database is open yet. Choose a file or enter a path above.
      </p>
      <div v-else class="connection-cards">
        <div
          v-for="connection in connections.data.value"
          :key="connection.id"
          class="connection-card"
        >
          <button
            class="connection-main"
            @click="
              router.push({
                name: 'connection',
                params: { connectionId: connection.id },
              })
            "
          >
            <Database :size="22" /><span
              ><strong>{{ connection.label ?? 'SQLite database' }}</strong
              ><small
                >{{ connection.adapterId }} · Connected read-only</small
              ></span
            ><ArrowUpRight :size="18" /></button
          ><button
            class="icon-button"
            :disabled="closing === connection.id"
            :aria-label="`Close ${connection.label ?? 'connection'}`"
            @click="close(connection.id)"
          >
            <X :size="16" />
          </button>
        </div>
      </div>
    </section>
    <div class="history-grid">
      <section class="connection-section">
        <div class="section-title">
          <Clock3 :size="18" />
          <h2>Recent</h2>
        </div>
        <p v-if="!workspace.recent.length" class="empty-line">
          Databases you open will appear here.
        </p>
        <button
          v-for="profile in workspace.recent"
          :key="profile.path ?? profile.name"
          class="profile-row"
          @click="reopen(profile)"
        >
          <Database :size="18" /><span
            ><strong>{{ profile.name }}</strong
            ><small>{{
              profile.kind === 'path'
                ? profile.path
                : 'Choose the file again to reopen'
            }}</small></span
          ><ArrowUpRight :size="16" />
        </button>
      </section>
      <section class="connection-section">
        <div class="section-title">
          <Bookmark :size="18" />
          <h2>Saved connections</h2>
        </div>
        <p v-if="!workspace.saved.length" class="empty-line">
          Save a local path to reconnect in one click.
        </p>
        <div
          v-for="profile in workspace.saved"
          :key="profile.path"
          class="saved-row"
        >
          <button class="profile-row" @click="reopen(profile)">
            <Bookmark :size="18" /><span
              ><strong>{{ profile.name }}</strong
              ><small>{{ profile.path }}</small></span
            ><ArrowUpRight :size="16" /></button
          ><button
            class="icon-button"
            :aria-label="`Remove saved ${profile.name}`"
            @click="workspace.forget(profile)"
          >
            <X :size="16" />
          </button>
        </div>
      </section>
    </div>
    <footer class="home-footer">
      <span class="status-dot"></span> Runs locally. No account, no cloud, no
      changes to your data.
    </footer>
  </main>
</template>
