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
const noListState = document.getElementById('no-list-state') as HTMLParagraphElement;

const mobileQuery = window.matchMedia('(max-width: 768px)');

const state: AppState = loadState();
let renamingId: string | null = null;
let editingItemId: string | null = null;

// Nesting level for the add-item form, relative to the list's root (0).
// null means "same level as the item visually above the form".
let addLevel: number | null = null;

// Where the add-item form sits in the list: after the item with afterId
// (null afterId = very top of the list). null means the default position,
// pinned to the end of the list.
let addPos: { afterId: string | null } | null = null;

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
    addPos = null;
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

// The add form occupies a gap in the list, described by the row visually
// above it plus a nesting level, clamped to what is valid for that gap
// (same rules as dropping a dragged item there).
interface AddSpot {
  above: FlatRow | null;
  level: number;
  minLevel: number;
  maxLevel: number;
}

function addSpot(list: Checklist): AddSpot {
  const rows = flattenItems(list.items);
  let above: FlatRow | null = null;
  let below: FlatRow | null = null;
  if (addPos === null) {
    above = rows[rows.length - 1] ?? null; // pinned to the end of the list
  } else if (addPos.afterId === null) {
    below = rows[0] ?? null; // very top
  } else {
    above = rows.find((r) => r.item.id === addPos!.afterId) ?? null;
    if (above) {
      below = rows[rows.indexOf(above) + 1] ?? null;
    } else {
      // The item the form was anchored to is gone; fall back to the end.
      addPos = null;
      above = rows[rows.length - 1] ?? null;
    }
  }
  const maxLevel = above ? above.depth + 1 : 0;
  const minLevel = below ? below.depth : 0;
  const level = Math.min(Math.max(addLevel ?? (above ? above.depth : 0), minLevel), maxLevel);
  return { above, level, minLevel, maxLevel };
}

function changeAddLevel(delta: number): void {
  const list = selectedList();
  if (!list) return;
  addLevel = addSpot(list).level + delta;
  renderMain();
  input.focus();
}

// Insert the form (wrapped in an <li>) into the item tree at its spot.
function placeAddForm(list: Checklist): void {
  const spot = addSpot(list);
  const formLi = document.createElement('li');
  formLi.className = 'form-li';
  form.hidden = false;
  formLi.append(form);

  if (!spot.above) {
    itemList.prepend(formLi);
  } else if (spot.level > spot.above.depth) {
    // First child of the item above.
    const parentLi = itemList.querySelector(`li[data-id="${spot.above.item.id}"]`)!;
    let ul = parentLi.querySelector(':scope > ul');
    if (!ul) {
      ul = document.createElement('ul');
      parentLi.append(ul);
    }
    ul.prepend(formLi);
  } else {
    // Next sibling of the item-above's ancestor at the form's level.
    const ancestor = spot.above.chain[spot.level];
    const ancestorLi = itemList.querySelector(`li[data-id="${ancestor.item.id}"]`)!;
    ancestorLi.after(formLi);
  }

  outdentButton.disabled = spot.level <= spot.minLevel;
  indentButton.disabled = spot.level >= spot.maxLevel;
}

function renderMain(): void {
  const list = selectedList();
  currentListName.textContent = list ? list.name : 'Checklist';
  noListState.hidden = !!list;
  if (!list) {
    itemList.replaceChildren();
    return;
  }
  itemList.replaceChildren(...list.items.map((item) => renderItem(list.items, item)));
  placeAddForm(list);
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

  row.append(checkbox, text, deleteButton);
  li.append(row);

  if (item.children.length > 0) {
    const ul = document.createElement('ul');
    ul.append(...item.children.map((child) => renderItem(item.children, child)));
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
let draggingForm = false;
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

function computeDropSpot(
  list: Checklist,
  li: HTMLLIElement | null,
  clientX: number,
  clientY: number,
): DropSpot | null {
  const rows = flattenItems(list.items);
  const subtree = new Set<string>();
  if (draggingId) {
    // Dragging an item: its subtree moves with it, so ignore those rows.
    const dragged = rows.find((r) => r.item.id === draggingId);
    if (!dragged) return null;
    collectIds(dragged.item, subtree);
  }

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
    before = clientY < rect.top + rect.height / 3;
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
  const cursorDepth = dragStartDepth + Math.round((clientX - dragStartX) / indentPx);
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

function beginDrag(li: HTMLLIElement, startX: number): void {
  draggingId = li.dataset.id!;
  dragStartX = startX;
  const list = selectedList();
  dragStartDepth = list
    ? (flattenItems(list.items).find((r) => r.item.id === draggingId)?.depth ?? 0)
    : 0;
  (li.firstElementChild as HTMLElement).classList.add('dragging');
}

function showDropIndicator(spot: DropSpot): void {
  clearDropIndicator();
  if (!spot.li) return;
  const row = spot.li.firstElementChild as HTMLElement;
  row.style.setProperty('--indent-delta', `${(spot.depth - spot.liDepth) * INDENT_REM}rem`);
  spot.li.classList.add(spot.before ? 'drop-before' : 'drop-after');
  indicatorLi = spot.li;
}

function beginFormDrag(list: Checklist, startX: number): void {
  draggingForm = true;
  dragStartX = startX;
  dragStartDepth = addSpot(list).level;
  form.classList.add('dragging');
}

function finishDrag(spot: DropSpot | null): void {
  clearDropIndicator();
  const list = selectedList();
  if (list && spot) {
    if (draggingId) {
      const dragged = flattenItems(list.items).find((r) => r.item.id === draggingId);
      if (dragged) moveItem(list, dragged, spot);
    } else if (draggingForm) {
      // Re-anchor the add form to the gap it was dropped in.
      addPos = { afterId: spot.above?.item.id ?? null };
      addLevel = spot.depth;
      render();
      input.focus();
    }
  }
  draggingId = null;
  draggingForm = false;
  form.classList.remove('dragging');
  itemList.querySelector('.dragging')?.classList.remove('dragging');
}

// Desktop: native HTML5 drag and drop.

itemList.addEventListener('dragstart', (event) => {
  if ((event.target as Element).closest?.('#new-item-form')) {
    const list = selectedList();
    if (!list || !event.dataTransfer) return;
    beginFormDrag(list, event.clientX);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'add-form');
    return;
  }
  const li = dropTargetLi(event);
  if (!li || !event.dataTransfer) return;
  beginDrag(li, event.clientX);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggingId!);
});

itemList.addEventListener('dragover', (event) => {
  const list = selectedList();
  if (!list || (!draggingId && !draggingForm)) return;
  event.preventDefault();
  event.dataTransfer!.dropEffect = 'move';
  const spot = computeDropSpot(list, dropTargetLi(event), event.clientX, event.clientY);
  clearDropIndicator();
  if (spot) showDropIndicator(spot);
});

itemList.addEventListener('drop', (event) => {
  event.preventDefault();
  const list = selectedList();
  if (!list || (!draggingId && !draggingForm)) return;
  finishDrag(computeDropSpot(list, dropTargetLi(event), event.clientX, event.clientY));
});

itemList.addEventListener('dragend', () => {
  draggingId = null;
  draggingForm = false;
  form.classList.remove('dragging');
  clearDropIndicator();
  itemList.querySelector('.dragging')?.classList.remove('dragging');
});

// Touch: HTML5 drag events don't fire on mobile, so long-press to lift an
// item, then move the finger to place it. A quick swipe still scrolls.

const LONG_PRESS_MS = 100;
const SCROLL_SLOP_PX = 8;

let touchTimer: number | null = null;
let touchDragging = false;
let touchStartX = 0;
let touchStartY = 0;
let touchSpot: DropSpot | null = null;

function cancelTouchDrag(): void {
  if (touchTimer !== null) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
  if (touchDragging) {
    touchDragging = false;
    touchSpot = null;
    draggingId = null;
    draggingForm = false;
    form.classList.remove('dragging');
    clearDropIndicator();
    itemList.querySelector('.dragging')?.classList.remove('dragging');
  }
}

itemList.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length !== 1) return;
    const target = event.target as Element;
    if (target.closest?.('#new-item-form')) {
      // Long-press the add box itself to move it; buttons still just click.
      if (target.closest('button')) return;
      const list = selectedList();
      if (!list) return;
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchTimer = window.setTimeout(() => {
        touchTimer = null;
        touchDragging = true;
        touchSpot = null;
        beginFormDrag(list, touchStartX);
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
      return;
    }
    if (target.closest?.('input, button')) return;
    const li = target.closest?.('li[data-id]') as HTMLLIElement | null;
    if (!li) return;
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchTimer = window.setTimeout(() => {
      touchTimer = null;
      touchDragging = true;
      touchSpot = null;
      beginDrag(li, touchStartX);
      navigator.vibrate?.(10);
    }, LONG_PRESS_MS);
  },
  { passive: true },
);

itemList.addEventListener(
  'touchmove',
  (event) => {
    const touch = event.touches[0];
    if (!touchDragging) {
      // Finger moved before the long press fired: it's a scroll, not a drag.
      if (
        touchTimer !== null &&
        (Math.abs(touch.clientX - touchStartX) > SCROLL_SLOP_PX ||
          Math.abs(touch.clientY - touchStartY) > SCROLL_SLOP_PX)
      ) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      return;
    }
    event.preventDefault(); // keep the viewport from scrolling while dragging
    const list = selectedList();
    if (!list) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const li = (el?.closest?.('li[data-id]') as HTMLLIElement) ?? null;
    touchSpot = computeDropSpot(list, li, touch.clientX, touch.clientY);
    clearDropIndicator();
    if (touchSpot) showDropIndicator(touchSpot);
  },
  { passive: false },
);

itemList.addEventListener('touchend', () => {
  if (touchTimer !== null) {
    clearTimeout(touchTimer);
    touchTimer = null;
  }
  if (!touchDragging) return;
  touchDragging = false;
  const spot = touchSpot;
  touchSpot = null;
  finishDrag(spot);
});

itemList.addEventListener('touchcancel', cancelTouchDrag);

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
  const spot = addSpot(list);
  const item = createItem(text);
  if (!spot.above) {
    list.items.unshift(item);
  } else if (spot.level > spot.above.depth) {
    spot.above.item.children.unshift(item);
  } else {
    const ancestor = spot.above.chain[spot.level];
    ancestor.siblings.splice(ancestor.siblings.indexOf(ancestor.item) + 1, 0, item);
  }
  // Keep the form right below what was just added (unless pinned to the end).
  if (addPos !== null) addPos = { afterId: item.id };
  addLevel = spot.level;
  input.value = '';
  persistAndRender();
  input.focus();
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
