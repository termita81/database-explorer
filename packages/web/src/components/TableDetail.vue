<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Table2,
  Columns3,
  KeyRound,
  ListFilter,
  Network,
  Search,
  ArrowUpRight,
  Hash,
} from 'lucide-vue-next';
import type {
  Column,
  Relationship,
  TableDetail,
  TableRef,
} from '@db-explorer/core';
const props = defineProps<{
  table: TableDetail;
  view: string;
  relationships: Relationship[];
  relationshipsLoading?: boolean;
  relationshipsError?: string;
}>();
const emit = defineEmits<{
  view: [view: string];
  navigate: [table: TableRef];
  inspect: [column: Column];
  retryRelationships: [];
}>();
const sections = [
  { id: 'overview', label: 'Overview', icon: Table2 },
  { id: 'columns', label: 'Columns', icon: Columns3 },
  { id: 'keys', label: 'Keys & constraints', icon: KeyRound },
  { id: 'indexes', label: 'Indexes', icon: ListFilter },
  { id: 'relationships', label: 'Relationships', icon: Network },
];
const search = ref('');
const searching = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const columns = computed(() =>
  props.table.columns.filter((column) =>
    `${column.name} ${column.type}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const incoming = computed(() =>
  props.relationships.filter(
    (edge) =>
      edge.to.schema === props.table.schema &&
      edge.to.name === props.table.name,
  ),
);
function term(index: TableDetail['indexes'][number]) {
  return (
    index.terms
      ?.map(
        (item) =>
          `${item.column ?? item.expression ?? 'Unknown expression'}${item.descending ? ' DESC' : ''}`,
      )
      .join(', ') ?? index.columns.join(', ')
  );
}
function typing(event: KeyboardEvent) {
  if (
    event.target instanceof HTMLInputElement ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.key.length !== 1
  )
    return;
  searching.value = true;
  search.value += event.key;
  event.preventDefault();
  queueMicrotask(() => searchInput.value?.focus());
}
</script>
<template>
  <article class="table-detail">
    <header class="table-header">
      <div class="table-icon"><Table2 :size="24" /></div>
      <div>
        <div class="eyebrow">{{ table.schema }} / TABLE</div>
        <h1>{{ table.name }}</h1>
      </div>
      <span class="chip">{{ table.columns.length }} columns</span>
    </header>
    <div class="detail-tabs" role="tablist" aria-label="Table details">
      <button
        v-for="section in sections"
        :key="section.id"
        role="tab"
        :aria-selected="view === section.id"
        :class="{ selected: view === section.id }"
        @click="emit('view', section.id)"
      >
        <component :is="section.icon" :size="16" />{{ section.label }}
      </button>
    </div>
    <section
      v-if="view === 'overview'"
      class="detail-content"
      role="tabpanel"
      aria-label="Overview"
    >
      <h2>At a glance</h2>
      <p class="muted">
        The structure of {{ table.name }}, straight from your database.
      </p>
      <div class="metric-grid">
        <div>
          <Columns3 :size="20" /><strong>{{ table.columns.length }}</strong
          ><span>Columns</span>
        </div>
        <div>
          <KeyRound :size="20" /><strong>{{
            table.primaryKey ? table.primaryKey.columns.length : 0
          }}</strong
          ><span>Primary-key columns</span>
        </div>
        <div>
          <Network :size="20" /><strong>{{ table.foreignKeys.length }}</strong
          ><span>Foreign keys</span>
        </div>
        <div>
          <ListFilter :size="20" /><strong>{{ table.indexes.length }}</strong
          ><span>Indexes</span>
        </div>
      </div>
      <div class="overview-grid">
        <section class="info-card">
          <h3><KeyRound :size="17" /> Primary key</h3>
          <p v-if="table.primaryKey" class="code-list">
            <code v-for="name in table.primaryKey.columns" :key="name">{{
              name
            }}</code>
          </p>
          <p v-else class="muted">This table has no primary key.</p>
        </section>
        <section class="info-card">
          <h3><Network :size="17" /> Connected tables</h3>
          <p v-if="!table.foreignKeys.length" class="muted">
            No outgoing foreign keys.
          </p>
          <button
            v-for="(key, index) in table.foreignKeys"
            :key="index"
            class="link-row"
            @click="emit('navigate', key.referencedTable)"
          >
            {{ key.referencedTable.name }}<ArrowUpRight :size="16" />
          </button>
        </section>
      </div>
      <div class="quiet-note">
        <Hash :size="16" /> Row counts and data samples will be available in a
        later phase.
      </div>
    </section>
    <section
      v-else-if="view === 'columns'"
      class="detail-content"
      role="tabpanel"
      aria-label="Columns"
      tabindex="0"
      @keydown="typing"
    >
      <div class="section-title">
        <h2>
          Columns <span class="count">{{ table.columns.length }}</span>
        </h2>
        <button
          class="icon-button"
          aria-label="Filter columns"
          @click="searching = !searching"
        >
          <Search :size="17" /></button
        ><label v-if="searching" class="inline-search"
          ><input
            ref="searchInput"
            v-model="search"
            placeholder="Filter columns…"
            aria-label="Search columns"
            @keydown.esc="
              searching = false;
              search = '';
            "
        /></label>
      </div>
      <div class="data-table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Nullable</th>
              <th>Default</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="column in columns"
              :key="column.name"
              @click="emit('inspect', column)"
            >
              <td>
                <button
                  class="column-name"
                  @click.stop="emit('inspect', column)"
                >
                  <KeyRound
                    v-if="table.primaryKey?.columns.includes(column.name)"
                    :size="14"
                    class="key-icon"
                  /><Columns3 v-else :size="14" />{{ column.name }}
                </button>
              </td>
              <td>
                <code class="type-text">{{
                  column.type || 'Unspecified'
                }}</code>
              </td>
              <td>
                <span :class="column.nullable ? 'nullable' : 'not-null'">{{
                  column.nullable ? 'Yes' : 'No'
                }}</span>
              </td>
              <td>
                <code v-if="column.default !== null">{{ column.default }}</code
                ><span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!columns.length" class="empty-line">No matching columns.</p>
      </div>
    </section>
    <section
      v-else-if="view === 'keys'"
      class="detail-content"
      role="tabpanel"
      aria-label="Keys and constraints"
    >
      <h2>Primary key</h2>
      <p v-if="table.primaryKey" class="code-list">
        <span v-if="table.primaryKey.name">{{ table.primaryKey.name }}</span
        ><code v-for="name in table.primaryKey.columns" :key="name">{{
          name
        }}</code>
      </p>
      <p v-else class="empty-line">No primary key is declared.</p>
      <h2>
        Foreign keys <span class="count">{{ table.foreignKeys.length }}</span>
      </h2>
      <p v-if="!table.foreignKeys.length" class="empty-line">
        No foreign keys are declared.
      </p>
      <div
        v-for="(key, index) in table.foreignKeys"
        :key="index"
        class="constraint-row"
      >
        <KeyRound :size="18" />
        <div>
          <strong>{{ key.name ?? key.columns.join(', ') }}</strong>
          <p>
            <code>{{ key.columns.join(', ') }}</code> →
            <button
              class="text-button"
              @click="emit('navigate', key.referencedTable)"
            >
              {{ key.referencedTable.name }} <ArrowUpRight :size="13" />
            </button>
            <code
              >({{
                key.referencedColumns
                  .map((name) => name ?? 'Unknown')
                  .join(', ')
              }})</code
            >
          </p>
        </div>
      </div>
      <h2>Unique constraints</h2>
      <p v-if="!table.uniqueConstraints.length" class="empty-line">
        No unique constraints are declared.
      </p>
      <div
        v-for="(key, index) in table.uniqueConstraints"
        :key="index"
        class="constraint-row"
      >
        <KeyRound :size="18" />
        <div>
          <strong>{{ key.name ?? 'Unique constraint' }}</strong>
          <p>
            <code>{{ key.columns.join(', ') }}</code>
          </p>
        </div>
      </div>
      <h2>Check constraints</h2>
      <p v-if="!table.checkConstraints.length" class="empty-line">
        No check constraints are declared.
      </p>
      <div
        v-for="(check, index) in table.checkConstraints"
        :key="index"
        class="constraint-row"
      >
        <ListFilter :size="18" />
        <div>
          <strong>{{ check.name ?? 'Check constraint' }}</strong>
          <p>
            <code>{{ check.expression }}</code>
          </p>
        </div>
      </div>
    </section>
    <section
      v-else-if="view === 'indexes'"
      class="detail-content"
      role="tabpanel"
      aria-label="Indexes"
    >
      <h2>
        Indexes <span class="count">{{ table.indexes.length }}</span>
      </h2>
      <p v-if="!table.indexes.length" class="empty-line">
        This table has no indexes.
      </p>
      <div v-for="index in table.indexes" :key="index.name" class="index-card">
        <div>
          <ListFilter :size="17" /><strong>{{ index.name }}</strong
          ><span v-if="index.unique" class="chip">Unique</span>
        </div>
        <code>{{ term(index) }}</code>
        <p v-if="index.predicate">
          <span class="muted">WHERE </span><code>{{ index.predicate }}</code>
        </p>
        <small
          v-if="
            index.terms?.some(
              (term) => term.collation && term.collation !== 'BINARY',
            )
          "
          class="muted"
          >Collation:
          {{
            index.terms.map((term) => term.collation ?? 'Unknown').join(', ')
          }}</small
        >
      </div>
    </section>
    <section
      v-else
      class="detail-content"
      role="tabpanel"
      aria-label="Relationships"
    >
      <h2>
        Outgoing relationships
        <span class="count">{{ table.foreignKeys.length }}</span>
      </h2>
      <p class="muted">Foreign keys in this table point to these tables.</p>
      <p v-if="!table.foreignKeys.length" class="empty-line">
        No outgoing relationships.
      </p>
      <button
        v-for="(key, index) in table.foreignKeys"
        :key="index"
        class="relationship-card"
        @click="emit('navigate', key.referencedTable)"
      >
        <Network :size="20" /><span
          ><strong
            >{{ table.name }} <span class="muted">→</span>
            {{ key.referencedTable.name }}</strong
          ><small
            >{{ key.columns.join(', ') }} →
            {{
              key.referencedColumns.map((name) => name ?? 'Unknown').join(', ')
            }}</small
          ></span
        ><ArrowUpRight :size="18" />
      </button>
      <h2>
        Incoming relationships
        <span
          v-if="!relationshipsLoading && !relationshipsError"
          class="count"
          >{{ incoming.length }}</span
        >
      </h2>
      <p class="muted">Other tables that reference this table.</p>
      <p v-if="relationshipsLoading" role="status" class="empty-line">
        Loading incoming relationships…
      </p>
      <p v-else-if="relationshipsError" role="alert" class="error-message">
        {{ relationshipsError }}
        <button class="text-button" @click="emit('retryRelationships')">
          Try again
        </button>
      </p>
      <p v-else-if="!incoming.length" class="empty-line">
        No incoming relationships.
      </p>
      <button
        v-for="(edge, index) in incoming"
        v-else
        :key="index"
        class="relationship-card"
        @click="emit('navigate', edge.from)"
      >
        <Network :size="20" /><span
          ><strong
            >{{ edge.from.name }} <span class="muted">→</span>
            {{ table.name }}</strong
          ><small
            >{{ edge.foreignKey.columns.join(', ') }} →
            {{
              edge.foreignKey.referencedColumns
                .map((name) => name ?? 'Unknown')
                .join(', ')
            }}</small
          ></span
        ><ArrowUpRight :size="18" />
      </button>
    </section>
  </article>
</template>
