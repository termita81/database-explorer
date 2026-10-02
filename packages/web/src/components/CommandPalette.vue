<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import { Search, Table2, ArrowUpRight } from 'lucide-vue-next';
import type { TableRef, TableSummary } from '@db-explorer/core';
const props = defineProps<{ open: boolean; tables: TableSummary[] }>();
const emit = defineEmits<{
  'update:open': [open: boolean];
  select: [table: TableRef];
}>();
const search = ref('');
const selected = ref(0);
const matches = computed(() =>
  props.tables
    .filter((table) =>
      `${table.schema}.${table.name}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    )
    .slice(0, 30),
);
watch(
  () => props.open,
  (open) => {
    if (open) {
      search.value = '';
      selected.value = 0;
    }
  },
);
watch(search, () => {
  selected.value = 0;
});
function choose(table?: TableRef) {
  if (table) {
    emit('select', table);
    emit('update:open', false);
  }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selected.value = Math.max(
      0,
      Math.min(
        matches.value.length - 1,
        selected.value + (event.key === 'ArrowDown' ? 1 : -1),
      ),
    );
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    choose(matches.value[selected.value]);
  }
}
</script>
<template>
  <NModal :show="open" @update:show="emit('update:open', $event)">
    <div
      class="command-palette"
      role="dialog"
      aria-label="Jump to a table"
      aria-modal="true"
      @keydown.capture="keydown"
    >
      <label class="palette-search"
        ><Search :size="20" /><input
          v-model="search"
          aria-label="Find a table"
          placeholder="Where would you like to go?"
          role="combobox"
          aria-controls="palette-results"
          :aria-expanded="true"
          :aria-activedescendant="
            matches.length ? `palette-option-${selected}` : undefined
          "
        /><kbd>ESC</kbd></label
      >
      <div class="palette-caption">
        TABLES <span>{{ matches.length }} results</span>
      </div>
      <div id="palette-results" class="palette-results" role="listbox">
        <button
          v-for="(table, index) in matches"
          :id="`palette-option-${index}`"
          :key="`${table.schema}.${table.name}`"
          role="option"
          :aria-selected="selected === index"
          :class="{ selected: selected === index }"
          @click="choose(table)"
        >
          <Table2 :size="18" /><span
            >{{ table.name }}<small>{{ table.schema }}</small></span
          ><ArrowUpRight :size="16" />
        </button>
        <p v-if="!matches.length" class="muted">
          No matching tables. Try a different name.
        </p>
      </div>
      <footer><span>↑ ↓ to navigate</span><span>↵ to open</span></footer>
    </div>
  </NModal>
</template>
