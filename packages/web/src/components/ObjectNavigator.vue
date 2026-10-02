<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { Search, Table2 } from 'lucide-vue-next';
import type { TableRef, TableSummary } from '@db-explorer/core';
const props = defineProps<{
  tables: TableSummary[];
  active?: TableRef;
  loading?: boolean;
}>();
const emit = defineEmits<{ select: [table: TableRef] }>();
const search = ref('');
const scroller = ref<HTMLElement | null>(null);
const filtered = computed(() =>
  props.tables.filter((table) =>
    `${table.schema}.${table.name}`
      .toLowerCase()
      .includes(search.value.toLowerCase()),
  ),
);
const virtualizer = useVirtualizer(
  computed(() => ({
    count: filtered.value.length,
    getScrollElement: () => scroller.value,
    estimateSize: () => 40,
    overscan: 8,
    initialRect: { width: 240, height: 480 },
  })),
);
const rows = computed(() => virtualizer.value.getVirtualItems());
watch(search, () => virtualizer.value.scrollToOffset(0));
function isActive(table: TableRef) {
  return (
    props.active?.schema === table.schema && props.active?.name === table.name
  );
}
</script>
<template>
  <nav class="object-navigator" aria-label="Database tables">
    <div class="pane-heading">
      <span>TABLES</span><span class="count">{{ tables.length }}</span>
    </div>
    <label class="search-field"
      ><Search :size="16" /><input
        v-model="search"
        aria-label="Search tables"
        placeholder="Search tables…"
    /></label>
    <p v-if="loading" class="muted pane-message" role="status">
      Loading tables…
    </p>
    <p v-else-if="!filtered.length" class="muted pane-message">
      {{
        tables.length
          ? 'No matching tables. Try a different search.'
          : 'This database has no tables.'
      }}
    </p>
    <div v-else ref="scroller" class="virtual-scroll">
      <div
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }"
      >
        <button
          v-for="row in rows"
          :key="String(row.key)"
          class="object-row"
          :class="{ selected: isActive(filtered[row.index]!) }"
          :aria-current="isActive(filtered[row.index]!) ? 'page' : undefined"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${row.size}px`,
            transform: `translateY(${row.start}px)`,
          }"
          @click="emit('select', filtered[row.index]!)"
        >
          <Table2 :size="16" /><span
            >{{ filtered[row.index]!.name
            }}<small v-if="filtered[row.index]!.schema !== 'main'">{{
              filtered[row.index]!.schema
            }}</small></span
          >
        </button>
      </div>
    </div>
    <div class="navigator-footer">
      <span class="status-dot"></span> Connected · schema only
    </div>
  </nav>
</template>
