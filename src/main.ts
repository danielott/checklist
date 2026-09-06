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

  const label = document.createElement('label');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = item.checked;
  checkbox.addEventListener('change', () => {
    item.checked = checkbox.checked;
    persistAndRender();
  });

  const text = document.createElement('span');
  text.textContent = item.text;

  label.append(checkbox, text);

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

  row.append(label, addChildButton, deleteButton);
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

interface FlatRow {
  item: Item;
  siblings: Item[];
}

// All items in visual (depth-first) order, each with the array it lives in.
function flattenItems(items: Item[], out: FlatRow[] = []): FlatRow[] {
  for (const item of items) {
    out.push({ item, siblings: items });
    flattenItems(item.children, out);
  }
  return out;
}

function collectIds(item: Item, out: Set<string>): void {
  out.add(item.id);
  for (const child of item.children) collectIds(child, out);
}

let draggingId: string | null = null;
let indicatorLi: HTMLLIElement | null = null;

function clearDropIndicator(): void {
  indicatorLi?.classList.remove('drop-before', 'drop-after');
  indicatorLi = null;
}

function dropTargetLi(event: DragEvent): HTMLLIElement | null {
  return (event.target as Element).closest?.('li[data-id]') ?? null;
}

function isBeforeRow(li: HTMLLIElement, clientY: number): boolean {
  const rect = (li.firstElementChild as HTMLElement).getBoundingClientRect();
  return clientY < rect.top + rect.height / 2;
}

function moveItem(list: Checklist, id: string, targetLi: HTMLLIElement | null, clientY: number): void {
  const rows = flattenItems(list.items);
  const dragged = rows.find((r) => r.item.id === id);
  if (!dragged) return;

  const subtree = new Set<string>();
  collectIds(dragged.item, subtree);
  if (targetLi && subtree.has(targetLi.dataset.id!)) return; // can't drop into itself

  let gap: number; // insertion point between visual rows [gap-1] and [gap]
  if (targetLi) {
    const targetIndex = rows.findIndex((r) => r.item.id === targetLi.dataset.id);
    if (targetIndex === -1) return;
    gap = isBeforeRow(targetLi, clientY) ? targetIndex : targetIndex + 1;
  } else {
    gap = rows.length; // dropped on empty space below the list
  }

  // Dropping right next to the dragged row leaves everything as-is.
  if (rows[gap]?.item.id === id || rows[gap - 1]?.item.id === id) return;

  // The item visually above the drop point (skipping the dragged subtree)
  // determines both position and depth: the moved item becomes its next sibling.
  let above: FlatRow | null = null;
  for (let i = gap - 1; i >= 0; i--) {
    if (!subtree.has(rows[i].item.id)) {
      above = rows[i];
      break;
    }
  }

  dragged.siblings.splice(dragged.siblings.indexOf(dragged.item), 1);
  if (above) {
    above.siblings.splice(above.siblings.indexOf(above.item) + 1, 0, dragged.item);
  } else {
    list.items.unshift(dragged.item);
  }
  persistAndRender();
}

itemList.addEventListener('dragstart', (event) => {
  const li = dropTargetLi(event);
  if (!li || !event.dataTransfer) return;
  draggingId = li.dataset.id!;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggingId);
  (li.firstElementChild as HTMLElement).classList.add('dragging');
});

itemList.addEventListener('dragover', (event) => {
  if (!draggingId) return;
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  const li = dropTargetLi(event);
  clearDropIndicator();
  if (!li || li.dataset.id === draggingId) return;
  li.classList.add(isBeforeRow(li, event.clientY) ? 'drop-before' : 'drop-after');
  indicatorLi = li;
});

itemList.addEventListener('drop', (event) => {
  event.preventDefault();
  clearDropIndicator();
  const list = selectedList();
  if (!list || !draggingId) return;
  moveItem(list, draggingId, dropTargetLi(event), event.clientY);
  draggingId = null;
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
