// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import type {
  TableDetail as TableModel,
  TableSummary,
} from '@db-explorer/core';
import ObjectNavigator from '../src/components/ObjectNavigator.vue';
import CommandPalette from '../src/components/CommandPalette.vue';
import TableDetail from '../src/components/TableDetail.vue';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 480,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 240,
  });
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
});
const tables: TableSummary[] = [
  { schema: 'main', name: 'people', kind: 'table' },
  { schema: 'main', name: 'memberships', kind: 'table' },
];

describe('Object navigator', () => {
  it('filters objects by name and emits their complete reference', async () => {
    const wrapper = mount(ObjectNavigator, {
      props: { tables },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.get('input').setValue('member');
    await flushPromises();
    expect(wrapper.text()).toContain('memberships');
    expect(wrapper.text()).not.toContain('people');
    await wrapper.get('.object-row').trigger('click');
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({
      schema: 'main',
      name: 'memberships',
    });
    wrapper.unmount();
  });
  it('keeps a large schema virtualized and searches the entire list', async () => {
    const many = Array.from({ length: 5000 }, (_, index): TableSummary => ({
      schema: 'main',
      name: `table_${index}`,
      kind: 'table',
    }));
    const wrapper = mount(ObjectNavigator, {
      props: { tables: many },
      attachTo: document.body,
    });
    await flushPromises();
    expect(wrapper.findAll('.object-row').length).toBeLessThan(40);
    await wrapper.get('input').setValue('table_4999');
    await flushPromises();
    expect(wrapper.get('.object-row').text()).toBe('table_4999');
    wrapper.unmount();
  });
  it('distinguishes empty schemas and search misses', async () => {
    const wrapper = mount(ObjectNavigator, { props: { tables: [] } });
    expect(wrapper.text()).toContain('no tables');
    await wrapper.setProps({ tables });
    await wrapper.get('input').setValue('missing');
    expect(wrapper.text()).toContain('No matching tables');
    wrapper.unmount();
  });
});

describe('Command palette', () => {
  it('filters and opens a table using the keyboard', async () => {
    const wrapper = mount(CommandPalette, {
      props: { open: true, tables },
      global: { stubs: { Modal: { template: '<div><slot/></div>' } } },
    });
    await wrapper.get('input').setValue('people');
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(tables[0]);
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    wrapper.unmount();
  });
  it('supports arrow selection and gives feedback for no matches', async () => {
    const wrapper = mount(CommandPalette, {
      props: { open: true, tables },
      global: { stubs: { Modal: { template: '<div><slot/></div>' } } },
    });
    await wrapper.get('input').trigger('keydown', { key: 'ArrowDown' });
    await wrapper.get('input').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')?.[0]?.[0]).toEqual(tables[1]);
    await wrapper.get('input').setValue('missing');
    expect(wrapper.text()).toContain('No matching tables');
    wrapper.unmount();
  });
});

describe('Table detail', () => {
  const table: TableModel = {
    schema: 'main',
    name: 'memberships',
    kind: 'table',
    columns: [
      { name: 'team_id', type: 'INTEGER', nullable: false, default: null },
      { name: 'tenant_id', type: 'TEXT', nullable: true, default: null },
      { name: 'project_id', type: 'INTEGER', nullable: true, default: null },
      { name: 'person_id', type: 'INTEGER', nullable: false, default: null },
      { name: 'role', type: 'TEXT', nullable: false, default: "'member'" },
    ],
    primaryKey: { columns: ['team_id', 'person_id'] },
    foreignKeys: [
      {
        name: 'membership_project',
        columns: ['tenant_id', 'project_id'],
        referencedTable: { schema: 'main', name: 'projects' },
        referencedColumns: ['tenant_id', 'project_id'],
      },
    ],
    uniqueConstraints: [],
    checkConstraints: [
      { name: 'membership_role', expression: "role IN ('member', 'owner')" },
    ],
    indexes: [],
  };
  it('shows column types, nullability, defaults, and selection', async () => {
    const wrapper = mount(TableDetail, {
      props: { table, view: 'columns', relationships: [] },
    });
    expect(wrapper.text()).toContain("'member'");
    expect(wrapper.findAll('tbody tr')).toHaveLength(5);
    await wrapper.get('.column-name').trigger('click');
    expect(wrapper.emitted('inspect')?.[0]?.[0]).toEqual(table.columns[0]);
    wrapper.unmount();
  });
  it('preserves composite key ordering and emits a referenced table', async () => {
    const wrapper = mount(TableDetail, {
      props: { table, view: 'keys', relationships: [] },
    });
    expect(wrapper.text()).toContain('tenant_id, project_id');
    expect(wrapper.text()).toContain('membership_role');
    const target = wrapper
      .findAll('.text-button')
      .find((button) => button.text().includes('projects'))!;
    await target.trigger('click');
    expect(wrapper.emitted('navigate')?.[0]?.[0]).toEqual({
      schema: 'main',
      name: 'projects',
    });
    wrapper.unmount();
  });
  it('shows incoming relationships and does not present load failures as empty data', async () => {
    const wrapper = mount(TableDetail, {
      props: {
        table,
        view: 'relationships',
        relationships: [],
        relationshipsLoading: true,
      },
    });
    expect(wrapper.text()).toContain('Loading incoming');
    await wrapper.setProps({
      relationshipsLoading: false,
      relationshipsError: 'Connection unavailable',
    });
    expect(wrapper.text()).toContain('Connection unavailable');
    expect(wrapper.text()).not.toContain('No incoming relationships');
    wrapper.unmount();
  });
  it('displays expression and partial-index metadata', () => {
    const wrapper = mount(TableDetail, {
      props: {
        table: {
          ...table,
          indexes: [
            {
              name: 'expression_index',
              columns: [],
              unique: true,
              terms: [
                {
                  column: null,
                  expression: 'lower(role)',
                  descending: true,
                  collation: 'NOCASE',
                },
              ],
              predicate: 'role IS NOT NULL',
            },
          ],
        },
        view: 'indexes',
        relationships: [],
      },
    });
    expect(wrapper.text()).toContain('lower(role) DESC');
    expect(wrapper.text()).toContain('role IS NOT NULL');
    expect(wrapper.text()).toContain('NOCASE');
    wrapper.unmount();
  });
});
