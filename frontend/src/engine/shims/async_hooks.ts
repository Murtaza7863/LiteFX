export class AsyncLocalStorage<T> {
  private current: T | undefined;

  getStore(): T | undefined {
    return this.current;
  }

  run<R>(store: T, fn: () => R): R {
    const prev = this.current;
    this.current = store;
    try {
      return fn();
    } finally {
      this.current = prev;
    }
  }
}
