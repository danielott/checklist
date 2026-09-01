// Persistence layer. Kept separate from the UI so it can later be swapped
// for something with sync (e.g. for the PWA / native app versions) without
// touching rendering code.

export interface Item {
  id: string;
  text: string;
  checked: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'checklist-items';

export function loadItems(): Item[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function saveItems(items: Item[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function createItem(text: string): Item {
  return {
    id: crypto.randomUUID(),
    text,
    checked: false,
    createdAt: Date.now(),
  };
}
