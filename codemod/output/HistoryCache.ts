class HistoryCache {
  public cacheStore: any
  supported: boolean
  static supported: () => boolean

  constructor(mockLocalStorage) {
    const supported = HistoryCache.supported()
    this.cacheStore = mockLocalStorage
      ? {}
      : supported
      ? localStorage
      : undefined
  }

  getItem(key) {
    if (this.cacheStore) {
      return this.cacheStore[key]
    }
  }

  setItem(key, value) {
    if (this.cacheStore) {
      this.cacheStore[key] = value
    }
  }

  removeItem(key) {
    if (this.cacheStore) {
      return delete this.cacheStore[key]
    }
  }
}
HistoryCache.prototype.supported = false
HistoryCache.prototype.cacheStore = undefined
HistoryCache.supported = () => {
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
export { HistoryCache }
