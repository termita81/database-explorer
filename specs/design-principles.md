
## Purpose of this document

This document describes how the DB Explorer interface should look and behave. It records patterns and decisions so the interface stays consistent as it grows. It complements the constitution, which states the high-level principles, and the tech-stack document, which lists the tools used to build it.

## Guiding ideas

- The interface should be usable without instruction. A first-time user should be able to connect and start exploring without reading anything.
- The same interaction should work the same way everywhere. If a list can be filtered in one place, lists should be filtered the same way in every place.
- The user is exploring, not completing a task with a fixed end. Navigation should feel like moving around a space, with the ability to retrace steps.
- Nothing the interface shows should be mistaken for something it is not. An estimate should never look like an exact figure.

## Layout

The main screen uses three panes:

- A left pane containing the object navigator.
- A central pane containing the current object's detail view, organised into tabs.
- An optional right pane containing contextual information about the selected item.

The home screen, shown when no connection is open, lists recent and saved connections and offers a way to start a new one.

## Navigation model

- Navigation behaves like a web browser. There is a back and a forward action, and the user can return to any earlier view.
- Every view has its own URL, so a view can be bookmarked or reopened, even though the application runs locally.
- A breadcrumb shows the path to the current view — for example connection, then schema, then table.
- A command palette, opened with a keyboard shortcut and with a visible control, lets the user jump directly to any object by name. This is the primary way to navigate a database with a large number of objects.

## Tabs

- Opening an object opens it in a tab. Following a relationship opens the target in a new tab, so the user does not lose their place.
- The list of open tabs is itself a list and follows the searchable-list pattern below once it grows long.

## Searchable lists

Lists appear throughout the interface: objects in the navigator, open tabs, columns in a table. They share one pattern.

- The main object navigator always shows a search field. That list is almost always long, so there is no benefit to hiding the field, and the space is paid for once.
- Other lists show a small search icon in their header. The icon is always present, so it never causes the layout to shift. Selecting it reveals an input that overlays the list, so content below it does not move. The input occupies space only while it is in use.
- When a list has keyboard focus, typing opens the same input, pre-filled with what was typed. This is an accelerator for keyboard users, not the only way to reach the search.
- Every such list uses the same visual treatment — consistent row height, a leading icon indicating the item's type, and consistent hover and selection states — so that a group of items reads as items of one kind.

## Showing uncertainty

- An estimated value is always labelled as an estimate and is visually distinguishable from an exact value.
- Sampled data is always labelled as a sample, and the estimated total is shown alongside it.
- When the interface cannot determine something — for example, because the connecting account lacks a permission — it says so, rather than showing nothing or showing a zero.

## Capability-driven interface

- A section of the interface is shown only when the current connection's capabilities include it. Sections are not shown in a disabled state for databases that do not support them.
- Engine-specific sections contributed by an adapter are rendered generically, from the structured content the adapter provides.

## Empty and loading states

- Every view that loads data has a defined loading state and a defined empty state.
- An empty state explains why it is empty and, where possible, what the user can do next.

## Open questions

- The exact behaviour of the searchable-list pattern — in particular whether a secondary affordance should appear at the point where a long list is clipped — should be validated with a prototype against a realistically long list before it is finalised.
- If a threshold is used to decide when a list's header gains a search icon, the item count for that threshold is not yet decided.
