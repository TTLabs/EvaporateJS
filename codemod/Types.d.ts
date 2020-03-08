export {};

declare global {
  interface Blob {
    webkitSlice
    mozSlice
  }
}