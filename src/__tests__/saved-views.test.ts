import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorageViewStore, savedViewsKey, ServerSavedViewStore, type SavedView } from '../views/saved-views';

// Minimal localStorage shim for the node test environment
const backing = new Map<string, string>();
beforeEach(() => {
  backing.clear();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    },
  };
});

describe('savedViewsKey', () => {
  it('is scoped by tenant and resource', () => {
    expect(savedViewsKey('t1', 'customer')).toBe('unerp:saved-views:t1:customer');
    expect(savedViewsKey(null, 'customer')).toBe('unerp:saved-views:no-tenant:customer');
    expect(savedViewsKey('t1', 'customer')).not.toBe(savedViewsKey('t2', 'customer'));
  });
});

describe('localStorageViewStore', () => {
  const key = savedViewsKey('t1', 'customer');
  const view: SavedView = {
    id: 'v1',
    name: 'Active only',
    state: { search: 'acme', filters: { status: 'active' }, sort: { field: 'name', direction: 'asc' } },
  };

  it('round-trips views', () => {
    localStorageViewStore.save(key, [view]);
    expect(localStorageViewStore.load(key)).toEqual([view]);
  });

  it('returns [] for missing or corrupt data', () => {
    expect(localStorageViewStore.load('unerp:saved-views:none:x')).toEqual([]);
    backing.set(key, '{not json');
    expect(localStorageViewStore.load(key)).toEqual([]);
    backing.set(key, '"a string"');
    expect(localStorageViewStore.load(key)).toEqual([]);
  });
});

describe('ServerSavedViewStore', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads views from backend API', async () => {
    const store = new ServerSavedViewStore(mockClient, 'customers');
    mockClient.get.mockResolvedValueOnce([
      { id: 'v1', name: 'View 1', state: { search: 'acme', filters: {}, sort: undefined } }
    ]);

    const result = await store.load('key');
    expect(mockClient.get).toHaveBeenCalledWith('/saved-views?resourceName=customers');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('View 1');
  });

  it('handles API exceptions gracefully on load', async () => {
    const store = new ServerSavedViewStore(mockClient, 'customers');
    mockClient.get.mockRejectedValueOnce(new Error('Network error'));

    const result = await store.load('key');
    expect(result).toEqual([]);
  });

  it('syncs saved views by deleting removed ones and posting new ones', async () => {
    const store = new ServerSavedViewStore(mockClient, 'customers');
    // Current server state has v1 and v2
    mockClient.get.mockResolvedValueOnce([
      { id: 'v1', name: 'View 1', state: { search: 'acme', filters: {}, sort: undefined } },
      { id: 'v2', name: 'View 2', state: { search: 'stark', filters: {}, sort: undefined } },
    ]);

    // Save payload has only v2 (updated state) and new v3
    const newViews = [
      { id: 'v2', name: 'View 2', state: { search: 'stark updated', filters: {}, sort: undefined } },
      { id: 'v3', name: 'View 3', state: { search: 'wayne', filters: {}, sort: undefined } },
    ];

    mockClient.delete.mockResolvedValueOnce({});
    mockClient.post.mockResolvedValue({});

    await store.save('key', newViews);

    // Should delete v1
    expect(mockClient.delete).toHaveBeenCalledWith('/saved-views/v1');
    // Should post updated v2 and new v3
    expect(mockClient.post).toHaveBeenCalledWith('/saved-views', {
      resourceName: 'customers',
      name: 'View 2',
      state: { search: 'stark updated', filters: {}, sort: undefined },
    });
    expect(mockClient.post).toHaveBeenCalledWith('/saved-views', {
      resourceName: 'customers',
      name: 'View 3',
      state: { search: 'wayne', filters: {}, sort: undefined },
    });
  });
});

