<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute, useRouter } from 'vue-router';
import { NButton } from 'naive-ui';
import {
  Database,
  ChevronRight,
  Table2,
  X,
  Search,
  ShieldCheck,
  RefreshCw,
  ArrowUpRight,
  Columns3,
} from 'lucide-vue-next';
import type { Column, TableRef } from '@db-explorer/core';
import { api, ApiError } from '../api';
import { useWorkspace } from '../store';
import ObjectNavigator from '../components/ObjectNavigator.vue';
import CommandPalette from '../components/CommandPalette.vue';
import TableDetail from '../components/TableDetail.vue';
const route = useRoute();
const router = useRouter();
const workspace = useWorkspace();
const client = useQueryClient();
const id = computed(() => String(route.params.connectionId));
const schema = computed(() => String(route.params.schema ?? ''));
const name = computed(() => String(route.params.tableName ?? ''));
const view = computed(() =>
  ['overview', 'columns', 'keys', 'indexes', 'relationships'].includes(
    String(route.query.view),
  )
    ? String(route.query.view)
    : 'overview',
);
const connection = useQuery({
  queryKey: computed(() => ['connection', id.value]),
  queryFn: ({ signal }) => api.connection(id.value, signal),
});
const tables = useQuery({
  queryKey: computed(() => ['tables', id.value]),
  queryFn: ({ signal }) => api.tables(id.value, signal),
  enabled: computed(() => !!connection.data.value?.capabilities.introspection),
});
const detail = useQuery({
  queryKey: computed(() => ['table', id.value, schema.value, name.value]),
  queryFn: ({ signal }) =>
    api.table(id.value, schema.value, name.value, signal),
  enabled: computed(
    () => !!name.value && !!connection.data.value?.capabilities.introspection,
  ),
});
const relationships = useQuery({
  queryKey: computed(() => ['relationships', id.value]),
  queryFn: ({ signal }) => api.relationships(id.value, signal),
  enabled: computed(
    () => !!detail.data.value && view.value === 'relationships',
  ),
});
const selectedColumn = ref<Column | null>(null);
const tabSearch = ref('');
const tabSearching = ref(false);
const openTabs = computed(() =>
  (workspace.tabs[id.value] ?? []).filter((tab) =>
    `${tab.schema}.${tab.name}`
      .toLowerCase()
      .includes(tabSearch.value.toLowerCase()),
  ),
);
watch(
  [id, schema, name],
  () => {
    selectedColumn.value = null;
    if (name.value)
      workspace.addTab(id.value, { schema: schema.value, name: name.value });
  },
  { immediate: true },
);
function navigate(table: TableRef) {
  void router.push({
    name: 'table',
    params: {
      connectionId: id.value,
      schema: table.schema,
      tableName: table.name,
    },
  });
}
function closeTab(table: TableRef) {
  workspace.closeTab(id.value, table);
  if (table.name === name.value && table.schema === schema.value) {
    const remaining = workspace.tabs[id.value]?.at(-1);
    if (remaining) navigate(remaining);
    else
      void router.push({
        name: 'connection',
        params: { connectionId: id.value },
      });
  }
}
async function refresh() {
  await client.invalidateQueries({
    predicate: (query) =>
      ['connection', 'tables', 'table', 'relationships'].includes(
        String(query.queryKey[0]),
      ) && query.queryKey[1] === id.value,
  });
}
</script>
<template>
  <main v-if="connection.isPending.value" class="center-state" role="status">
    <Database :size="36" />
    <h2>Opening your database…</h2>
  </main>
  <main v-else-if="connection.error.value" class="center-state" role="alert">
    <Database :size="36" />
    <h1>
      {{
        connection.error.value instanceof ApiError &&
        connection.error.value.code === 'CONNECTION_NOT_FOUND'
          ? 'This connection is no longer open.'
          : 'Could not load the connection.'
      }}
    </h1>
    <p>Return home to reconnect, or try loading it again.</p>
    <div>
      <NButton @click="connection.refetch()">Try again</NButton
      ><NButton type="primary" @click="router.push('/')">Go home</NButton>
    </div>
  </main>
  <main v-else class="explorer-layout">
    <aside class="left-pane">
      <div class="connection-label">
        <Database :size="20" /><span
          ><strong>{{
            connection.data.value?.label ?? 'SQLite database'
          }}</strong
          ><small
            >{{ connection.data.value?.adapterId }} · Read-only</small
          ></span
        >
      </div>
      <ObjectNavigator
        :tables="tables.data.value ?? []"
        :loading="
          tables.isPending.value &&
          !!connection.data.value?.capabilities.introspection
        "
        :active="name ? { name, schema } : undefined"
        @select="navigate"
      />
      <div
        v-if="tables.error.value"
        class="pane-message error-message"
        role="alert"
      >
        {{ tables.error.value.message }}
        <button class="text-button" @click="tables.refetch()">Try again</button>
      </div>
    </aside>
    <section class="main-pane">
      <div class="breadcrumb">
        <RouterLink to="/">Home</RouterLink
        ><ChevronRight :size="14" /><RouterLink
          :to="{ name: 'connection', params: { connectionId: id } }"
          >{{ connection.data.value?.label ?? 'Database' }}</RouterLink
        ><template v-if="name"
          ><ChevronRight :size="14" /><span>{{ schema }}</span
          ><ChevronRight :size="14" /><strong>{{ name }}</strong></template
        ><button
          class="icon-button"
          aria-label="Refresh schema"
          @click="refresh"
        >
          <RefreshCw :size="16" />
        </button>
      </div>
      <div v-if="workspace.tabs[id]?.length" class="object-tabs">
        <div class="tab-scroll" role="tablist" aria-label="Open tables">
          <div
            v-for="tab in openTabs"
            :key="`${tab.schema}.${tab.name}`"
            class="object-tab"
            :class="{ selected: tab.name === name && tab.schema === schema }"
          >
            <button
              role="tab"
              :aria-selected="tab.name === name && tab.schema === schema"
              @click="navigate(tab)"
            >
              <Table2 :size="14" />{{ tab.name }}</button
            ><button
              class="tab-close"
              :aria-label="`Close tab ${tab.name}`"
              @click="closeTab(tab)"
            >
              <X :size="13" />
            </button>
          </div>
        </div>
        <button
          class="icon-button"
          aria-label="Search open tabs"
          @click="tabSearching = !tabSearching"
        >
          <Search :size="16" /></button
        ><label v-if="tabSearching" class="inline-search"
          ><input
            v-model="tabSearch"
            aria-label="Filter open tabs"
            placeholder="Filter open tabs…"
            @keydown.esc="
              tabSearching = false;
              tabSearch = '';
            "
        /></label>
      </div>
      <div
        v-if="!connection.data.value?.capabilities.introspection"
        class="center-state"
      >
        <h1>Schema browsing is unavailable.</h1>
        <p>This connection does not support table introspection.</p>
      </div>
      <div v-else-if="!name" class="connection-overview">
        <span class="large-icon"><Database :size="34" /></span
        ><span class="eyebrow">CONNECTED & READY TO EXPLORE</span>
        <h1>{{ connection.data.value?.label ?? 'Your database' }}</h1>
        <p class="muted">
          Pick a table from the navigator, or jump straight to one by name.
        </p>
        <div class="overview-summary">
          <span
            ><strong>{{ tables.data.value?.length ?? '—' }}</strong>
            tables</span
          ><span><ShieldCheck :size="16" /> Read-only connection</span>
        </div>
        <NButton type="primary" @click="workspace.paletteOpen = true"
          ><template #icon><Search :size="17" /></template>Find a table</NButton
        >
        <div class="suggested-tables">
          <button
            v-for="table in (tables.data.value ?? []).slice(0, 6)"
            :key="`${table.schema}.${table.name}`"
            @click="navigate(table)"
          >
            <Table2 :size="18" /><span>{{ table.name }}</span
            ><ArrowUpRight :size="16" />
          </button>
        </div>
        <p
          v-if="tables.isSuccess.value && !tables.data.value?.length"
          class="empty-line"
        >
          There are no tables in this database. Choose another database from
          Home.
        </p>
      </div>
      <div
        v-else-if="detail.isPending.value"
        class="center-state"
        role="status"
      >
        <h2>Loading {{ name }}…</h2>
      </div>
      <div v-else-if="detail.error.value" class="center-state" role="alert">
        <h1>Could not open {{ name }}.</h1>
        <p>{{ detail.error.value.message }}</p>
        <NButton @click="detail.refetch()">Try again</NButton>
      </div>
      <TableDetail
        v-else-if="detail.data.value"
        :table="detail.data.value"
        :view="view"
        :relationships="relationships.data.value ?? []"
        :relationships-loading="
          relationships.isPending.value && view === 'relationships'
        "
        :relationships-error="relationships.error.value?.message"
        @view="router.replace({ query: { view: $event } })"
        @navigate="navigate"
        @inspect="selectedColumn = $event"
        @retry-relationships="relationships.refetch()"
      />
    </section>
    <aside class="right-pane">
      <template v-if="selectedColumn"
        ><div class="pane-heading">
          <span>COLUMN DETAILS</span
          ><button
            class="icon-button"
            aria-label="Close column details"
            @click="selectedColumn = null"
          >
            <X :size="15" />
          </button>
        </div>
        <div class="inspector-icon"><Columns3 :size="24" /></div>
        <h2>{{ selectedColumn.name }}</h2>
        <dl>
          <dt>Declared type</dt>
          <dd>
            <code>{{ selectedColumn.type || 'Unspecified' }}</code>
          </dd>
          <dt>Nullable</dt>
          <dd>{{ selectedColumn.nullable ? 'Yes' : 'No' }}</dd>
          <dt>Default expression</dt>
          <dd>
            <code>{{ selectedColumn.default ?? 'None' }}</code>
          </dd>
        </dl></template
      ><template v-else
        ><div class="pane-heading">CONTEXT</div>
        <div class="inspector-icon"><ShieldCheck :size="24" /></div>
        <h2>Explore with confidence.</h2>
        <p class="muted">
          This connection is read-only. Your database stays exactly as you left
          it.
        </p>
        <dl>
          <dt>Database</dt>
          <dd>{{ connection.data.value?.label ?? 'SQLite database' }}</dd>
          <dt>Engine</dt>
          <dd>{{ connection.data.value?.adapterId }}</dd>
          <dt v-if="name">Object</dt>
          <dd v-if="name">
            <code>{{ schema }}.{{ name }}</code>
          </dd>
        </dl>
        <div class="inspector-tip">
          <Search :size="18" />
          <p>Press <kbd>⌘ / Ctrl K</kbd> to jump to any table.</p>
        </div></template
      >
    </aside>
    <CommandPalette
      v-model:open="workspace.paletteOpen"
      :tables="tables.data.value ?? []"
      @select="navigate"
    />
  </main>
</template>
