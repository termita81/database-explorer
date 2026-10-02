<script setup lang="ts">
import { ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { NButton, NInput, NCheckbox, NModal } from 'naive-ui';
import {
  Database,
  Upload,
  FolderOpen,
  ArrowUpRight,
  Clock3,
  Bookmark,
  X,
  Plug,
  Pencil,
} from 'lucide-vue-next';
import type { ConnectionProfile, CredentialSource } from '@db-explorer/core';
import { api, ApiError } from '../api';
import { useWorkspace, type Profile } from '../store';
import { useConnectionActions } from '../actions';
const workspace = useWorkspace();
const router = useRouter();
const queryClient = useQueryClient();
const { openFile, openPath, openProfile } = useConnectionActions();
const connections = useQuery({
  queryKey: ['connections'],
  queryFn: ({ signal }) => api.connections(signal),
});
const profiles = useQuery({
  queryKey: ['profiles'],
  queryFn: ({ signal }) => api.profiles(signal),
});
const importing = ref(false);
async function importLegacyProfiles() {
  importing.value = true;
  profileError.value = '';
  try {
    for (const profile of [...workspace.legacySaved]) {
      if (profile.kind === 'path')
        await api.saveProfile({
          name: profile.name,
          adapterId: 'sqlite',
          config: { path: profile.path! },
        });
      workspace.forgetLegacy(profile);
    }
  } catch (error) {
    profileError.value =
      error instanceof Error
        ? error.message
        : 'Could not import browser profiles.';
  } finally {
    await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    importing.value = false;
  }
}
const activeProfiling = ref(true);
const editing = ref<ConnectionProfile | null>(null);
const editName = ref('');
const editPath = ref('');
const editProfiling = ref(true);
const editCredential = ref<CredentialSource>('none');
const editPassword = ref('');
const editPasswordReference = ref('${DB_PASSWORD}');
const credentialOptions = [
  { label: 'No password', value: 'none' },
  { label: 'Ask when connecting', value: 'prompt' },
  { label: 'Store in the OS keychain', value: 'keychain' },
  { label: 'Read from an environment variable', value: 'environment' },
];
function dismissEditor() {
  editing.value = null;
  editPassword.value = '';
}
const saving = ref(false);
const profileError = ref('');
const passwordProfile = ref<ConnectionProfile | null>(null);
const password = ref('');
function edit(profile: ConnectionProfile) {
  editing.value = profile;
  editName.value = profile.name;
  editPath.value = profile.config.path ?? '';
  editProfiling.value = profile.preferences.activeProfiling;
  editCredential.value = profile.credential;
  editPassword.value = '';
  editPasswordReference.value = profile.config.password ?? '${DB_PASSWORD}';
  profileError.value = '';
}
async function saveEdited() {
  if (!editing.value || saving.value) return;
  saving.value = true;
  profileError.value = '';
  try {
    const profile = editing.value;
    const config = { ...profile.config };
    delete config.password;
    if (
      profile.adapterId !== 'sqlite' &&
      editCredential.value === 'environment'
    )
      config.password = editPasswordReference.value;
    await api.saveProfile(
      {
        name: editName.value,
        adapterId: profile.adapterId,
        config:
          profile.adapterId === 'sqlite'
            ? { ...config, path: editPath.value }
            : config,
        preferences: { activeProfiling: editProfiling.value },
        credential:
          profile.adapterId === 'sqlite' ? 'none' : editCredential.value,
        ...(editCredential.value === 'keychain' && editPassword.value
          ? { password: editPassword.value }
          : {}),
      },
      profile.id,
    );
    await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    dismissEditor();
  } catch (error) {
    profileError.value =
      error instanceof Error ? error.message : 'Could not save the profile.';
  } finally {
    saving.value = false;
  }
}
async function remove(profile: ConnectionProfile) {
  profileError.value = '';
  try {
    await api.deleteProfile(profile.id);
    await queryClient.invalidateQueries({ queryKey: ['profiles'] });
  } catch (error) {
    profileError.value =
      error instanceof Error ? error.message : 'Could not remove the profile.';
  }
}
async function connectSaved(
  profile: ConnectionProfile,
  suppliedPassword?: string,
) {
  if (profile.credential === 'prompt' && suppliedPassword === undefined) {
    password.value = '';
    passwordProfile.value = profile;
    return;
  }
  try {
    if (await openProfile(profile, suppliedPassword)) {
      password.value = '';
      passwordProfile.value = null;
    }
  } catch (error) {
    if (
      error instanceof ApiError &&
      ['PASSWORD_REQUIRED', 'KEYCHAIN_UNAVAILABLE'].includes(error.code)
    ) {
      password.value = '';
      passwordProfile.value = profile;
    }
  }
}
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
        <form @submit.prevent="openPath(path, name, save, activeProfiling)">
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
          <p class="field-help">
            You can reference a server environment variable, for example
            <code>${DATABASE_PATH}</code>.
          </p>
          <NCheckbox v-model:checked="activeProfiling"
            >Allow active data profiling when available</NCheckbox
          >
          <div class="form-footer">
            <NCheckbox v-model:checked="save">Save connection profile</NCheckbox
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
        <p v-if="workspace.legacySaved.length" class="field-help">
          You have {{ workspace.legacySaved.length }} connection profiles from
          the earlier browser storage.
          <button
            class="text-button"
            :disabled="importing"
            @click="importLegacyProfiles"
          >
            Import browser profiles
          </button>
        </p>
        <p v-if="profiles.isPending.value" class="muted" role="status">
          Loading profiles…
        </p>
        <p v-else-if="profiles.error.value" class="error-message" role="alert">
          {{ profiles.error.value.message }}
          <button class="text-button" @click="profiles.refetch()">
            Try again
          </button>
        </p>
        <p v-else-if="!profiles.data.value?.length" class="empty-line">
          Save a local path to reconnect in one click.
        </p>
        <div
          v-for="profile in profiles.data.value"
          :key="profile.id"
          class="saved-row"
        >
          <button
            class="profile-row"
            @click="connectSaved(profile)"
            :disabled="workspace.opening"
          >
            <Bookmark :size="18" /><span
              ><strong>{{ profile.name }}</strong
              ><small>{{
                profile.config.path ?? profile.adapterId
              }}</small></span
            ><ArrowUpRight :size="16" /></button
          ><button
            class="icon-button"
            :aria-label="`Edit saved ${profile.name}`"
            @click="edit(profile)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button"
            :aria-label="`Remove saved ${profile.name}`"
            @click="remove(profile)"
          >
            <X :size="16" />
          </button>
        </div>
      </section>
    </div>
    <p v-if="profileError && !editing" class="error-message" role="alert">
      {{ profileError }}
    </p>
    <NModal :show="Boolean(editing)" @update:show="!$event && dismissEditor()">
      <div
        class="profile-dialog"
        role="dialog"
        aria-label="Edit connection profile"
        aria-modal="true"
      >
        <h2>Edit connection profile</h2>
        <form @submit.prevent="saveEdited">
          <label for="profile-name">Profile name</label>
          <NInput
            v-model:value="editName"
            :input-props="{ id: 'profile-name' }"
          />
          <template v-if="editing?.adapterId === 'sqlite'">
            <label for="profile-path">Database path</label>
            <NInput
              v-model:value="editPath"
              :input-props="{ id: 'profile-path' }"
            />
          </template>
          <template v-if="editing?.adapterId !== 'sqlite'">
            <label for="profile-credential-source">Password source</label>
            <select
              id="profile-credential-source"
              v-model="editCredential"
              class="profile-source"
            >
              <option
                v-for="option in credentialOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <template v-if="editCredential === 'keychain'">
              <label for="profile-stored-password"
                >Password for the OS keychain</label
              >
              <NInput
                v-model:value="editPassword"
                type="password"
                :input-props="{
                  id: 'profile-stored-password',
                  autocomplete: 'new-password',
                }"
                :placeholder="
                  editing?.credential === 'keychain'
                    ? 'Leave blank to keep the saved password'
                    : 'Enter a password'
                "
              />
            </template>
            <template v-if="editCredential === 'environment'">
              <label for="profile-password-reference"
                >Password environment reference</label
              >
              <NInput
                v-model:value="editPasswordReference"
                :input-props="{ id: 'profile-password-reference' }"
              />
            </template>
          </template>
          <NCheckbox v-model:checked="editProfiling"
            >Allow active data profiling when available</NCheckbox
          >
          <p class="field-help">
            This preference will apply when you next reconnect. Profiling is
            added in a later phase.
          </p>
          <p v-if="profileError" class="error-message" role="alert">
            {{ profileError }}
          </p>
          <div class="form-footer">
            <NButton @click="dismissEditor">Cancel</NButton
            ><NButton
              attr-type="submit"
              type="primary"
              :loading="saving"
              :disabled="!editName.trim()"
              >Save profile</NButton
            >
          </div>
        </form>
      </div>
    </NModal>
    <NModal
      :show="Boolean(passwordProfile)"
      @update:show="!$event && ((passwordProfile = null), (password = ''))"
    >
      <div
        class="profile-dialog"
        role="dialog"
        aria-label="Connection password"
        aria-modal="true"
      >
        <h2>Connect to {{ passwordProfile?.name }}</h2>
        <form
          @submit.prevent="
            passwordProfile && connectSaved(passwordProfile, password)
          "
        >
          <label for="profile-password">Password</label>
          <NInput
            v-model:value="password"
            type="password"
            :input-props="{
              id: 'profile-password',
              autocomplete: 'current-password',
            }"
          />
          <p class="field-help">Used for this connection only.</p>
          <p
            v-if="workspace.connectionError"
            class="error-message"
            role="alert"
          >
            {{ workspace.connectionError }}
          </p>
          <div class="form-footer">
            <NButton
              @click="
                passwordProfile = null;
                password = '';
              "
              >Cancel</NButton
            ><NButton
              type="primary"
              attr-type="submit"
              :loading="workspace.opening"
              :disabled="!password"
              >Connect</NButton
            >
          </div>
        </form>
      </div>
    </NModal>
    <footer class="home-footer">
      <span class="status-dot"></span> Runs locally. No account, no cloud, no
      changes to your data.
    </footer>
  </main>
</template>
