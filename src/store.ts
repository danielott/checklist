// Persistence layer. Kept separate from the UI so it can later be swapped
// for something with sync (e.g. for the PWA / native app versions) without
// touching rendering code.

export interface Item {
  id: string;
  text: string;
  checked: boolean;
  createdAt: number;
}

export interface Checklist {
  id: string;
  name: string;
  items: Item[];
  children: Checklist[];
}

export interface AppState {
  lists: Checklist[];
  selectedId: string | null;
}

const STORAGE_KEY = 'checklist-state';
const LEGACY_KEY = 'checklist-items';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw) as AppState;
      if (state && Array.isArray(state.lists)) return state;
    }
  } catch {
    // fall through to a fresh state
  }

  // Migrate data from the original single-list version of the app.
  let legacyItems: Item[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) legacyItems = parsed;
  } catch {
    // ignore unreadable legacy data
  }

  const first = createChecklist('My checklist');
  first.items = legacyItems;
  return { lists: [first], selectedId: first.id };
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createChecklist(name: string): Checklist {
  return { id: crypto.randomUUID(), name, items: [], children: [] };
}

export function createItem(text: string): Item {
  return {
    id: crypto.randomUUID(),
    text,
    checked: false,
    createdAt: Date.now(),
  };
}

export function findChecklist(lists: Checklist[], id: string): Checklist | null {
  for (const list of lists) {
    if (list.id === id) return list;
    const found = findChecklist(list.children, id);
    if (found) return found;
  }
  return null;
}

export function removeChecklist(lists: Checklist[], id: string): boolean {
  const index = lists.findIndex((list) => list.id === id);
  if (index !== -1) {
    lists.splice(index, 1);
    return true;
  }
  return lists.some((list) => removeChecklist(list.children, id));
}

export function countDescendants(list: Checklist): number {
  return list.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
