import { noOpLogger } from './Utils'

type Global = {
  HOURS_AGO: Date
  historyCache: any
  l: any
}

const Global = {} as Global
Global.l = noOpLogger()
Global.HOURS_AGO = null
Global.historyCache = null
export { Global }
