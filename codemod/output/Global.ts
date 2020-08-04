import { noOpLogger } from './Utils'
import { HistoryCache } from './HistoryCache'
import { LoggerInterface } from './LoggerInterface'

type Global = {
  HOURS_AGO: Date
  historyCache: HistoryCache
  l: LoggerInterface
}

const Global = {} as Global
Global.l = noOpLogger()
Global.HOURS_AGO = null
Global.historyCache = null
export { Global }
