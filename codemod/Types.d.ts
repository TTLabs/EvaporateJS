export {};

declare global {
  interface Blob extends Blob {
    webkitSlice
    mozSlice
  }
}