import { PanelPlugin } from '@grafana/data'
import { TvOptions } from './types'
import TvPanel from 'components/TvPanel'

export const plugin = new PanelPlugin<TvOptions>(TvPanel).setPanelOptions((builder) => {
  // const category = ['TradingView Chart'];

  //eslint-disable-next-line prefer-const
  let category = ['Candlestick Options']
  return builder
    .addTextInput({
      category,
      path: 'timeField',
      name: 'Time Field',
    })
    .addTextInput({
      category,
      path: 'openField',
      name: 'Open Field',
    })
    .addTextInput({
      category,
      path: 'highField',
      name: 'High Field',
    })
    .addTextInput({
      category,
      path: 'lowField',
      name: 'Low Field',
    })
    .addTextInput({
      category,
      path: 'closeField',
      name: 'Close Field',
    })
})
