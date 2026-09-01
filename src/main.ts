import {
  loadState,
  saveState,
  createChecklist,
  createItem,
  findChecklist,
  removeChecklist,
  countDescendants,
  type Checklist,
  type Item,
} from './store';

const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement;
const addRootButton = document.getElementById('add-root-list') as HTMLButtonElement;
const treeEl = document.getElementById('tree') as HTMLElement;
const backdrop = document.getElementById('backdrop') as HTMLDivElement;
const currentListName = document.getElementById('current-list-name') as HTMLHeadingElement;
const form = document.getElementById('new-item-form') as HTMLFormElement;
const input = document.getElementById('new-item-input') as HTMLInputElement;
const itemList = document.getElementById('item-list') as HTMLUListElement;
const emptyState = document.getElementById('empty-state') as HTMLParagraphElement;
const noListState = document.getElementById('no-list-state') as HTMLParagraphElement;

const mobileQuery = window.matchMedia('(max-width: 768px)');

const state = loadState();
let renamingId: string | null = null;

function selectedList(): Checklist | null {
  return state.selectedId ? findChecklist(state.lists, state.selectedId) : null;
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

// --- Checklist tree ---

function renderTree(): void {
  treeEl.replaceChildren(buildTreeList(state.lists));
}

function buildTreeList(lists: Checklist[]): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'tree';
  for (const list of lists) {
    const li = document.createElement('li');
    li.append(renamingId === list.id ? buildRenameRow(list) : buildTreeRow(list));
    if (list.children.length > 0) li.append(buildTreeList(list.children));
    ul.append(li);
  }
  return ul;
}

function buildTreeRow(list: Checklist): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.classList.toggle('selected', list.id === state.selectedId);

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'tree-name';
  name.textContent = list.name;
  name.addEventListener('click', () => {
    state.selectedId = list.id;
    closeMobileSidebar();
    persistAndRender();
  });

  const addChild = treeActionButton('＋', `Add sublist to "${list.name}"`, () => {
    const child = createChecklist('New list');
    list.children.push(child);
    state.selectedId = child.id;
    renamingId = child.id;
    persistAndRender();
  });

  const rename = treeActionButton('✎', `Rename "${list.name}"`, () => {
    renamingId = list.id;
    render();
  });

  const del = treeActionButton('×', `Delete "${list.name}"`, () => deleteList(list));

  row.append(name, addChild, rename, del);
  return row;
}

function treeActionButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tree-action';
  button.textContent = text;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function buildRenameRow(list: Checklist): HTMLInputElement {
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'tree-rename';
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
  const descendants = countDescendants(list);
  if (list.items.length > 0 || descendants > 0) {
    const detail = descendants > 0 ? ` and its ${descendants} sublist(s)` : '';
    if (!window.confirm(`Delete "${list.name}"${detail}?`)) return;
  }
  removeChecklist(state.lists, list.id);
  if (!selectedList()) {
    state.selectedId = state.lists[0]?.id ?? null;
  }
  persistAndRender();
}

// --- Items in the selected checklist ---

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
  itemList.replaceChildren(...list.items.map((item) => renderItem(list, item)));
  emptyState.hidden = list.items.length > 0;
}

function renderItem(list: Checklist, item: Item): HTMLLIElement {
  const li = document.createElement('li');
  li.classList.toggle('checked', item.checked);

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

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'delete';
  deleteButton.textContent = '×';
  deleteButton.setAttribute('aria-label', `Delete "${item.text}"`);
  deleteButton.addEventListener('click', () => {
    list.items = list.items.filter((i) => i.id !== item.id);
    persistAndRender();
  });

  li.append(label, deleteButton);
  return li;
}

// --- Wiring ---

function render(): void {
  renderTree();
  renderMain();
}

sidebarToggle.addEventListener('click', toggleSidebar);
backdrop.addEventListener('click', closeMobileSidebar);

addRootButton.addEventListener('click', () => {
  const list = createChecklist('New list');
  state.lists.push(list);
  state.selectedId = list.id;
  renamingId = list.id;
  persistAndRender();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const list = selectedList();
  const text = input.value.trim();
  if (!list || !text) return;
  list.items.push(createItem(text));
  input.value = '';
  persistAndRender();
});

if (!selectedList() && state.lists.length > 0) {
  state.selectedId = state.lists[0].id;
}
render();
