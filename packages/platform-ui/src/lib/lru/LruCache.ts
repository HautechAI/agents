export class LruCache<K, V> {
  private readonly capacity: number;
  private readonly entries = new Map<K, LruNode<K, V>>();
  private head: LruNode<K, V> | null = null;
  private tail: LruNode<K, V> | null = null;

  constructor(capacity: number) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('LRU cache capacity must be a positive finite number');
    }
    this.capacity = Math.floor(capacity);
    if (this.capacity <= 0) {
      throw new Error('LRU cache capacity must be at least 1');
    }
  }

  get(key: K): V | undefined {
    const node = this.entries.get(key);
    if (!node) return undefined;
    this.moveToFront(node);
    return node.value;
  }

  set(key: K, value: V): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      this.moveToFront(existing);
      return;
    }

    const node: LruNode<K, V> = { key, value, newer: null, older: null };
    this.entries.set(key, node);
    this.insertAtFront(node);
    if (this.entries.size > this.capacity) {
      this.evictLeastRecent();
    }
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  delete(key: K): boolean {
    const node = this.entries.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.entries.delete(key);
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.head = null;
    this.tail = null;
  }

  keys(): K[] {
    const result: K[] = [];
    let current = this.head;
    while (current) {
      result.push(current.key);
      current = current.newer;
    }
    return result;
  }

  get size(): number {
    return this.entries.size;
  }

  private moveToFront(node: LruNode<K, V>): void {
    if (this.head === node) return;
    this.removeNode(node);
    this.insertAtFront(node);
  }

  private insertAtFront(node: LruNode<K, V>): void {
    node.older = null;
    node.newer = this.head;
    if (this.head) {
      this.head.older = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LruNode<K, V>): void {
    if (node.older) {
      node.older.newer = node.newer;
    } else if (this.head === node) {
      this.head = node.newer;
    }

    if (node.newer) {
      node.newer.older = node.older;
    } else if (this.tail === node) {
      this.tail = node.older;
    }

    node.newer = null;
    node.older = null;
  }

  private evictLeastRecent(): void {
    if (!this.tail) return;
    const node = this.tail;
    this.removeNode(node);
    this.entries.delete(node.key);
  }
}

type LruNode<K, V> = {
  key: K;
  value: V;
  newer: LruNode<K, V> | null;
  older: LruNode<K, V> | null;
};
