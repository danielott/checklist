import {
  loadState,
  saveState,
  createChecklist,
  createItem,
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
const itemList = document.getElementById('item-list') as HTMLUListElement;
const emptyState = document.getElementById('empty-state') as HTMLParagraphElement;
const noListState = document.getElementById('no-list-state') as HTMLParagraphElement;

const mobileQuery = window.matchMedia('(max-width: 768px)');

const state: AppState = loadState();
let renamingId: string | null = null;

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
  list.items.push(createItem(text));
  input.value = '';
  persistAndRender();
});

if (!selectedList()) {
  state.selectedId = state.categories.flatMap((c) => c.lists)[0]?.id ?? null;
}
render();
