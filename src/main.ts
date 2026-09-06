import {
  loadState,
  saveState,
  createChecklist,
  createItem,
  countItemDescendants,
  findChecklist,
  removeChecklist,
  type AppState,
  type Category,
  type Checklist,
  type Item,
} from './store';

const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement;
const categoriesEl = document.getElementById('categories') as HTMLElement;
const backdrop = document.getElementById('backdrop') as HTMLDivElement;
const currentListName = document.getElementById('current-list-name') as HTMLHeadingElement;
const form = document.getElementById('new-item-form') as HTMLFormElement;
const input = document.getElementById('new-item-input') as HTMLInputElement;
const outdentButton = document.getElementById('outdent-button') as HTMLButtonElement;
const indentButton = document.getElementById('indent-button') as HTMLButtonElement;
const itemList = document.getElementById('item-list') as HTMLUListElement;
const emptyState = document.getElementById('empty-state') as HTMLParagraphElement;
const noListState = document.getElementById('no-list-state') as HTMLParagraphElement;

const mobileQuery = window.matchMedia('(max-width: 768px)');

const state: AppState = loadState();
let renamingId: string | null = null;
let addingChildToId: string | null = null;
let editingItemId: string | null = null;

// Nesting level for the add-item form, relative to the list's root (0).
// null means "same level as the item visually above the form".
let addLevel: number | null = null;

function selectedList(): Checklist | null {
  return state.selectedId ? findChecklist(state, state.selectedId) : null;
}

function persistAndRender(): void {
  saveState(state);
  render();
}

// --- Sidebar visibility ---

function toggleSidebar(): void {
  // Mobile uses an overlay (closed by default); desktop collapses in place.
  if (mobileQuery.matches) {
    document.body.classList.toggle('sidebar-open');
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
}

function closeMobileSidebar(): void {
  document.body.classList.remove('sidebar-open');
}

// --- Sidebar categories ---

function renderSidebar(): void {
  categoriesEl.replaceChildren(...state.categories.map(buildCategorySection));
}

function buildCategorySection(category: Category): HTMLElement {
  const section = document.createElement('section');
  section.className = 'category';

  const header = document.createElement('div');
  header.className = 'category-header';

  const title = document.createElement('h2');
  title.textContent = category.name;

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'category-add';
  add.textContent = '＋';
  add.title = `Add checklist to ${category.name}`;
  add.setAttribute('aria-label', `Add checklist to ${category.name}`);
  add.addEventListener('click', () => {
    const list = createChecklist('New list');
    category.lists.push(list);
    state.selectedId = list.id;
    renamingId = list.id;
    persistAndRender();
  });

  header.append(title, add);

  const ul = document.createElement('ul');
  ul.className = 'list-group';
  for (const list of category.lists) {
    const li = document.createElement('li');
    li.append(renamingId === list.id ? buildRenameRow(list) : buildListRow(list));
    ul.append(li);
  }

  section.append(header, ul);
  return section;
}

function buildListRow(list: Checklist): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'list-row';
  row.classList.toggle('selected', list.id === state.selectedId);

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'list-name';
  name.textContent = list.name;
  name.addEventListener('click', () => {
    state.selectedId = list.id;
    addLevel = null;
    closeMobileSidebar();
    persistAndRender();
  });

  const rename = listActionButton('✎', `Rename "${list.name}"`, () => {
    renamingId = list.id;
    render();
  });

  const del = listActionButton('×', `Delete "${list.name}"`, () => deleteList(list));

  row.append(name, rename, del);
  return row;
}

function listActionButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'list-action';
  button.textContent = text;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function buildRenameRow(list: Checklist): HTMLInputElement {
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'list-rename';
  nameInput.value = list.name;
  nameInput.setAttribute('aria-label', 'Checklist name');

  let cancelled = false;
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') nameInput.blur();
    if (event.key === 'Escape') {
      cancelled = true;
      nameInput.blur();
    }
  });
  nameInput.addEventListener('blur', () => {
    const name = nameInput.value.trim();
    if (!cancelled && name) list.name = name;
    renamingId = null;
    persistAndRender();
  });

  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
  return nameInput;
}

function deleteList(list: Checklist): void {
  if (list.items.length > 0 && !window.confirm(`Delete "${list.name}"?`)) return;
  removeChecklist(state, list.id);
  if (state.selectedId === list.id) {
    state.selectedId = state.categories.flatMap((c) => c.lists)[0]?.id ?? null;
  }
  persistAndRender();
}

// --- Items in the selected checklist ---

// The chain of "last items" from the root down: the item visually above the
// add form is the last element; each level of the chain is a valid parent
// for the new item.
function lastItemChain(list: Checklist): Item[] {
  const chain: Item[] = [];
  let items = list.items;
  while (items.length > 0) {
    const last = items[items.length - 1];
    chain.push(last);
    items = last.children;
  }
  return chain;
}

function currentAddLevel(list: Checklist): number {
  const maxLevel = lastItemChain(list).length;
  const defaultLevel = Math.max(0, maxLevel - 1);
  return Math.min(Math.max(addLevel ?? defaultLevel, 0), maxLevel);
}

function changeAddLevel(delta: number): void {
  const list = selectedList();
  if (!list) return;
  addLevel = currentAddLevel(list) + delta;
  renderMain();
  input.focus();
}

function renderMain(): void {
  const list = selectedList();
  currentListName.textContent = list ? list.name : 'Checklist';
  form.hidden = !list;
  noListState.hidden = !!list;
  if (!list) {
    itemList.replaceChildren();
    emptyState.hidden = true;
    return;
  }
  itemList.replaceChildren(...list.items.map((item) => renderItem(list.items, item)));
  emptyState.hidden = list.items.length > 0;

  const level = currentAddLevel(list);
  form.style.marginLeft = `${level * 1.5}rem`;
  outdentButton.disabled = level === 0;
  indentButton.disabled = level >= lastItemChain(list).length;
}

function renderItem(siblings: Item[], item: Item): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.id = item.id;

  const row = document.createElement('div');
  row.className = 'item-row';
  row.classList.toggle('checked', item.checked);
  row.draggable = true;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = item.checked;
  checkbox.addEventListener('change', () => {
    item.checked = checkbox.checked;
    persistAndRender();
  });

  let text: HTMLElement;
  if (editingItemId === item.id) {
    row.draggable = false; // so selecting text in the input doesn't start a drag
    text = buildItemEditInput(item);
  } else {
    const span = document.createElement('span');
    span.className = 'item-text';
    span.textContent = item.text;
    span.title = 'Click to edit';
    span.addEventListener('click', () => {
      editingItemId = item.id;
      render();
    });
    text = span;
  }

  const addChildButton = document.createElement('button');
  addChildButton.type = 'button';
  addChildButton.className = 'add-child';
  addChildButton.textContent = '＋';
  addChildButton.title = `Add sub-item to "${item.text}"`;
  addChildButton.setAttribute('aria-label', `Add sub-item to "${item.text}"`);
  addChildButton.addEventListener('click', () => {
    addingChildToId = item.id;
    render();
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete';
  deleteButton.textContent = '×';
  deleteButton.setAttribute('aria-label', `Delete "${item.text}"`);
  deleteButton.addEventListener('click', () => {
    const descendants = countItemDescendants(item);
    if (
      descendants > 0 &&
      !window.confirm(`Delete "${item.text}" and its ${descendants} sub-item(s)?`)
    ) {
      return;
    }
    siblings.splice(siblings.indexOf(item), 1);
    persistAndRender();
  });

  row.append(checkbox, text, addChildButton, deleteButton);
  li.append(row);

  if (item.children.length > 0 || addingChildToId === item.id) {
    const ul = document.createElement('ul');
    ul.append(...item.children.map((child) => renderItem(item.children, child)));
    if (addingChildToId === item.id) {
      const addLi = document.createElement('li');
      addLi.append(buildAddChildInput(item));
      ul.append(addLi);
    }
    li.append(ul);
  }
  return li;
}

function buildItemEditInput(item: Item): HTMLInputElement {
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'item-edit';
  editInput.value = item.text;
  editInput.setAttribute('aria-label', 'Edit item text');

  let done = false;
  const commit = (): void => {
    if (done) return;
    done = true;
    const text = editInput.value.trim();
    editingItemId = null;
    if (text) item.text = text;
    persistAndRender();
  };
  editInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      done = true;
      editingItemId = null;
      render();
    }
  });
  editInput.addEventListener('blur', commit);

  requestAnimationFrame(() => {
    editInput.focus();
    editInput.setSelectionRange(editInput.value.length, editInput.value.length);
  });
  return editInput;
}

function buildAddChildInput(item: Item): HTMLInputElement {
  const childInput = document.createElement('input');
  childInput.type = 'text';
  childInput.className = 'add-child-input';
  childInput.placeholder = 'Add a sub-item…';
  childInput.setAttribute('aria-label', `New sub-item of "${item.text}"`);

  let done = false;
  const commit = (): void => {
    if (done) return;
    done = true;
    const text = childInput.value.trim();
    addingChildToId = null;
    if (text) item.children.push(createItem(text));
    persistAndRender();
  };
  childInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      done = true;
      addingChildToId = null;
      render();
    }
  });
  childInput.addEventListener('blur', commit);

  requestAnimationFrame(() => childInput.focus());
  return childInput;
}

// --- Drag and drop reordering ---

const INDENT_REM = 1.5; // must match the nested <ul> padding in style.css

interface ChainEntry {
  item: Item;
  siblings: Item[];
}

interface FlatRow extends ChainEntry {
  depth: number;
  chain: ChainEntry[]; // ancestors from root down to (and including) this item
}

// All items in visual (depth-first) order.
function flattenItems(items: Item[], parents: ChainEntry[] = [], out: FlatRow[] = []): FlatRow[] {
  for (const item of items) {
    const chain = [...parents, { item, siblings: items }];
    out.push({ item, siblings: items, depth: parents.length, chain });
    flattenItems(item.children, chain, out);
  }
  return out;
}

function collectIds(item: Item, out: Set<string>): void {
  out.add(item.id);
  for (const child of item.children) collectIds(child, out);
}

let draggingId: string | null = null;
let dragStartX = 0;
let dragStartDepth = 0;
let indicatorLi: HTMLLIElement | null = null;

function clearDropIndicator(): void {
  indicatorLi?.classList.remove('drop-before', 'drop-after');
  indicatorLi = null;
}

function dropTargetLi(event: DragEvent): HTMLLIElement | null {
  return ((event.target as Element).closest?.('li[data-id]') as HTMLLIElement) ?? null;
}

interface DropSpot {
  li: HTMLLIElement | null;
  liDepth: number;
  before: boolean;
  depth: number; // insertion depth chosen by the cursor's horizontal position
  above: FlatRow | null; // row visually above the gap, outside the dragged subtree
}

function computeDropSpot(list: Checklist, event: DragEvent): DropSpot | null {
  const rows = flattenItems(list.items);
  const dragged = rows.find((r) => r.item.id === draggingId);
  if (!dragged) return null;
  const subtree = new Set<string>();
  collectIds(dragged.item, subtree);

  const li = dropTargetLi(event);
  let gap: number; // insertion point between visual rows [gap-1] and [gap]
  let before = false;
  let liDepth = 0;
  if (li) {
    const targetIndex = rows.findIndex((r) => r.item.id === li.dataset.id);
    if (targetIndex === -1) return null;
    liDepth = rows[targetIndex].depth;
    const rect = (li.firstElementChild as HTMLElement).getBoundingClientRect();
    // Only the top third of a row targets the gap above it; hovering the rest
    // of the row targets the gap below, where nesting into the row is allowed.
    before = event.clientY < rect.top + rect.height / 3;
    gap = before ? targetIndex : targetIndex + 1;
  } else {
    gap = rows.length; // hovering the empty space below the list
  }

  let above: FlatRow | null = null;
  for (let i = gap - 1; i >= 0; i--) {
    if (!subtree.has(rows[i].item.id)) {
      above = rows[i];
      break;
    }
  }
  let below: FlatRow | null = null;
  for (let i = gap; i < rows.length; i++) {
    if (!subtree.has(rows[i].item.id)) {
      below = rows[i];
      break;
    }
  }

  // Valid depths at this gap: deep enough not to orphan the item below,
  // at most one level deeper than the item above (its first child).
  const maxDepth = above ? above.depth + 1 : 0;
  const minDepth = below ? below.depth : 0;
  // Depth follows how far the cursor moved horizontally since the drag began,
  // starting from the item's original depth.
  const indentPx = INDENT_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
  const cursorDepth = dragStartDepth + Math.round((event.clientX - dragStartX) / indentPx);
  const depth = Math.min(Math.max(cursorDepth, minDepth), maxDepth);

  return { li, liDepth, before, depth, above };
}

function moveItem(list: Checklist, dragged: FlatRow, spot: DropSpot): void {
  dragged.siblings.splice(dragged.siblings.indexOf(dragged.item), 1);
  if (!spot.above) {
    list.items.unshift(dragged.item);
  } else if (spot.depth > spot.above.depth) {
    spot.above.item.children.unshift(dragged.item);
  } else {
    // Become the next sibling of the item-above's ancestor at the target depth.
    const ancestor = spot.above.chain[spot.depth];
    ancestor.siblings.splice(ancestor.siblings.indexOf(ancestor.item) + 1, 0, dragged.item);
  }
  persistAndRender();
}

itemList.addEventListener('dragstart', (event) => {
  const li = dropTargetLi(event);
  if (!li || !event.dataTransfer) return;
  draggingId = li.dataset.id!;
  dragStartX = event.clientX;
  const list = selectedList();
  dragStartDepth = list
    ? (flattenItems(list.items).find((r) => r.item.id === draggingId)?.depth ?? 0)
    : 0;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggingId);
  (li.firstElementChild as HTMLElement).classList.add('dragging');
});

itemList.addEventListener('dragover', (event) => {
  const list = selectedList();
  if (!list || !draggingId) return;
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  clearDropIndicator();
  const spot = computeDropSpot(list, event);
  if (!spot?.li) return;
  const row = spot.li.firstElementChild as HTMLElement;
  row.style.setProperty('--indent-delta', `${(spot.depth - spot.liDepth) * INDENT_REM}rem`);
  spot.li.classList.add(spot.before ? 'drop-before' : 'drop-after');
  indicatorLi = spot.li;
});

itemList.addEventListener('drop', (event) => {
  event.preventDefault();
  clearDropIndicator();
  const list = selectedList();
  if (!list || !draggingId) return;
  const spot = computeDropSpot(list, event);
  const dragged = flattenItems(list.items).find((r) => r.item.id === draggingId);
  draggingId = null;
  if (spot && dragged) moveItem(list, dragged, spot);
});

itemList.addEventListener('dragend', () => {
  draggingId = null;
  clearDropIndicator();
  itemList.querySelector('.dragging')?.classList.remove('dragging');
});

// --- Wiring ---

function render(): void {
  renderSidebar();
  renderMain();
}

sidebarToggle.addEventListener('click', toggleSidebar);
backdrop.addEventListener('click', closeMobileSidebar);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const list = selectedList();
  const text = input.value.trim();
  if (!list || !text) return;
  const level = currentAddLevel(list);
  const chain = lastItemChain(list);
  const siblings = level === 0 ? list.items : chain[level - 1].children;
  siblings.push(createItem(text));
  addLevel = level;
  input.value = '';
  persistAndRender();
});

outdentButton.addEventListener('click', () => changeAddLevel(-1));
indentButton.addEventListener('click', () => changeAddLevel(1));

input.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  changeAddLevel(event.shiftKey ? -1 : 1);
});

if (!selectedList()) {
  state.selectedId = state.categories.flatMap((c) => c.lists)[0]?.id ?? null;
}
render();
