import { Dictionary } from './Types'

class HistoryCache {
  public cacheStore: Dictionary<string>
  supported: boolean = false

  static supported(): boolean {
    const result = false

    if (typeof window !== 'undefined') {
      if (!('localStorage' in window)) {
        return result
      }
    } else {
      return result
    }

    // Try to use storage (it might be disabled, e.g. user is in private mode)
    try {
      const k = '___test'
      localStorage[k] = 'OK'
      const test = localStorage[k]
      delete localStorage[k]
      return test === 'OK'
    } catch (e) {
      return result
    }
  }

  constructor(mockLocalStorage: boolean) {
    const supported = HistoryCache.supported()
    this.cacheStore = mockLocalStorage
      ? {}
      : supported
      ? localStorage
      : undefined
  }

  getItem(key: string): string {
    if (this.cacheStore) {
      return this.cacheStore[key]
    }
  }

  setItem(key: string, value: string): void {
    if (this.cacheStore) {
      this.cacheStore[key] = value
    }
  }

  removeItem(key: string): boolean {
    if (this.cacheStore) {
      return delete this.cacheStore[key]
    }
  }
}

export { HistoryCache }
