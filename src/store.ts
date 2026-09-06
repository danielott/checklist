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
}

export const CATEGORY_NAMES = ['Ongoing', 'Recurring', 'Situational'] as const;
export type CategoryName = (typeof CATEGORY_NAMES)[number];

export interface Category {
  name: CategoryName;
  lists: Checklist[];
}

export interface AppState {
  categories: Category[];
  selectedId: string | null;
}

const STORAGE_KEY = 'checklist-state';
const LEGACY_KEY = 'checklist-items';

function emptyCategories(): Category[] {
  return CATEGORY_NAMES.map((name) => ({ name, lists: [] }));
}

export function loadState(): AppState {
  let parsed: unknown = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === 'object') {
    const state = parsed as Partial<AppState> & { lists?: unknown[] };
    if (Array.isArray(state.categories)) {
      // Current shape; make sure all three categories exist.
      const categories = emptyCategories().map(
        (empty) =>
          (state.categories as Category[]).find((c) => c && c.name === empty.name) ?? empty,
      );
      return { categories, selectedId: state.selectedId ?? null };
    }
    if (Array.isArray(state.lists)) {
      // Previous tree-of-checklists shape: flatten everything into Ongoing.
      const categories = emptyCategories();
      categories[0].lists = flattenTree(state.lists as TreeChecklist[]);
      return { categories, selectedId: state.selectedId ?? null };
    }
  }

  // Migrate data from the original single-list version of the app.
  let legacyItems: Item[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const legacy = raw ? JSON.parse(raw) : [];
    if (Array.isArray(legacy)) legacyItems = legacy;
  } catch {
    // ignore unreadable legacy data
  }

  const categories = emptyCategories();
  let selectedId: string | null = null;
  if (legacyItems.length > 0) {
    const first = createChecklist('My checklist');
    first.items = legacyItems;
    categories[0].lists.push(first);
    selectedId = first.id;
  }
  return { categories, selectedId };
}

interface TreeChecklist extends Checklist {
  children?: TreeChecklist[];
}

function flattenTree(lists: TreeChecklist[]): Checklist[] {
  const flat: Checklist[] = [];
  for (const list of lists) {
    flat.push({ id: list.id, name: list.name, items: list.items ?? [] });
    if (list.children?.length) flat.push(...flattenTree(list.children));
  }
  return flat;
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createChecklist(name: string): Checklist {
  return { id: crypto.randomUUID(), name, items: [] };
}

export function createItem(text: string): Item {
  return {
    id: crypto.randomUUID(),
    text,
    checked: false,
    createdAt: Date.now(),
  };
}

export function findChecklist(state: AppState, id: string): Checklist | null {
  for (const category of state.categories) {
    const found = category.lists.find((list) => list.id === id);
    if (found) return found;
  }
  return null;
}

export function removeChecklist(state: AppState, id: string): void {
  for (const category of state.categories) {
    category.lists = category.lists.filter((list) => list.id !== id);
  }
}
