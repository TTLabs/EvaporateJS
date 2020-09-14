interface DefaultLogger {
  d: Function
  w: Function
  e: Function
}

export type LoggerInterface = DefaultLogger & Partial<Console>
