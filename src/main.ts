import { loadItems, saveItems, createItem, type Item } from './store';

const form = document.getElementById('new-item-form') as HTMLFormElement;
const input = document.getElementById('new-item-input') as HTMLInputElement;
const list = document.getElementById('item-list') as HTMLUListElement;
const emptyState = document.getElementById('empty-state') as HTMLParagraphElement;

let items: Item[] = loadItems();

function persistAndRender(): void {
  saveItems(items);
  render();
}

function render(): void {
  list.replaceChildren(...items.map(renderItem));
  emptyState.hidden = items.length > 0;
}

function renderItem(item: Item): HTMLLIElement {
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
    items = items.filter((i) => i.id !== item.id);
    persistAndRender();
  });

  li.append(label, deleteButton);
  return li;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  items.push(createItem(text));
  input.value = '';
  persistAndRender();
});

render();
