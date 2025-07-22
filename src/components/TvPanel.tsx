import React, { useEffect, useRef, useState } from 'react'

import { AlertErrorPayload, AlertPayload, AppEvents, PanelProps } from '@grafana/data'
import { Alert, useStyles2, useTheme2 } from '@grafana/ui'

import { css, cx } from '@emotion/css'
import {
  createChart,
  IChartApi,
  CandlestickSeries,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
  LineSeries,
  SeriesOptionsMap,
  LineData,
} from 'lightweight-charts'
import { TvOptions } from 'types'
import { getAppEvents } from '@grafana/runtime'

const getStyles = () => {
  return {
    wrapper: css`
      font-family: Open Sans;
      position: relative;
    `,
    container: css`
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    `,
    svg: css`
      position: absolute;
      top: 0;
      left: 0;
    `,
    textBox: css`
      position: absolute;
      bottom: 0;
      left: 0;
      padding: 10px;
    `,
  }
}

type Props = PanelProps<TvOptions>

export default function TvPanel({
  options,
  data,
  width,
  height,
  fieldConfig,
  id,
  timeZone,
  timeRange,
}: Readonly<Props>) {
  const styles = useStyles2(getStyles)
  const theme = useTheme2()

  const [error, setError] = useState<Error | undefined>()
  const [themeError, setThemeError] = useState<Error | undefined>()

  /**
   * Events
   */
  const appEvents = getAppEvents()
  const notifySuccess = (payload: AlertPayload) => appEvents.publish({ type: AppEvents.alertSuccess.name, payload })
  const notifyError = (payload: AlertErrorPayload) => appEvents.publish({ type: AppEvents.alertError.name, payload })

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const chartSeriesRef = useRef<Array<ISeriesApi<keyof SeriesOptionsMap>>>([])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      width,
      height,
      autoSize: true,

      layout: {
        background: { color: theme.colors.background.primary },
        textColor: theme.colors.text.primary,
      },
      grid: {
        vertLines: { color: theme.colors.border.weak },
        horzLines: { color: theme.colors.border.weak },
      },
      localization: {
        // dateFormat: 'yyyy-MM-dd',
        timeFormatter: (timestamp: UTCTimestamp | string) => {
          let date: Date
          if (typeof timestamp === 'string') {
            date = new Date(timestamp)
          } else {
            date = new Date(timestamp * 1000)
          }

          return date.toLocaleString(window.navigator.language, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: timeZone === 'browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone,
          })
        },
      },
    })
    chartRef.current = chart

    return () => {
      // chartSeriesRef.current.forEach(series => chart.removeSeries(series))
      chartSeriesRef.current = []
      chart.remove()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current, width, height, theme, timeRange])

  useEffect(() => {
    if (data.state !== 'Done' || !chartRef.current) {
      if (chartSeriesRef.current.length > 0) {
        chartSeriesRef.current.forEach((series) => chartRef.current?.removeSeries(series))
        chartSeriesRef.current = []
      }
      return
    }

    const chart = chartRef.current
    for (const series of chartSeriesRef.current) {
      chart.removeSeries(series)
    }
    chartSeriesRef.current = []

    let foundCandleSeries = false

    for (const series of data.series) {
      const fields = series.fields

      const candleFieldNames = [
        options.openField || 'open',
        options.highField || 'high',
        options.lowField || 'low',
        options.closeField || 'close',
      ]
      let isCandleSeries = false

      if (!foundCandleSeries) {
        isCandleSeries = candleFieldNames.every((name) => fields.some((f) => f.name.toLowerCase() === name))
        if (isCandleSeries) {
          foundCandleSeries = true
        }
      }

      function normalizeTimestamp(ts: number | string): UTCTimestamp | string {
        if (typeof ts === 'string') {
          const tts = parseInt(ts, 10)

          if (isNaN(tts)) {
            return ts
          }
          ts = tts
        }
        if (ts < 1e11) {
          return ts as UTCTimestamp
        } else {
          return (ts / 1000) as UTCTimestamp
        }
      }

      if (isCandleSeries) {
        const timeField = fields.find((f) => f.name.toLowerCase() === (options.timeField || 'time').toLowerCase())
        const openField = fields.find((f) => f.name.toLowerCase() === (options.openField || 'open').toLowerCase())
        const highField = fields.find((f) => f.name.toLowerCase() === (options.highField || 'high').toLowerCase())
        const lowField = fields.find((f) => f.name.toLowerCase() === (options.lowField || 'low').toLowerCase())
        const closeField = fields.find((f) => f.name.toLowerCase() === (options.closeField || 'close').toLowerCase())
        // const volumeField = fields.find(f => f.name.toLowerCase() === (options.volumeField || 'volume').toLowerCase())

        if (!timeField || !openField || !highField || !lowField || !closeField) {
          notifyError(['Missing required fields for candlestick series:'])
          continue
        }

        const data: CandlestickData[] = []
        // const volumeData: number[] = volumeField ? [] : undefined
        for (let j = 0; j < timeField.values.length; j++) {
          let time
          switch (timeField.type) {
            case 'number':
              time = normalizeTimestamp(timeField.values[j])
              break
            case 'string':
              time = timeField.values[j] as string
              break
            case 'time':
              time = normalizeTimestamp(timeField.values[j])
              break
            default:
              notifyError(['Unsupported time field type'])
              continue
          }

          if (time === undefined) {
            notifyError(['Invalid time value'])
            continue
          }

          data.push({
            time,
            open: openField.values[j],
            high: highField.values[j],
            low: lowField.values[j],
            close: closeField.values[j],
          })
        }
        const s = chart.addSeries(CandlestickSeries, {
          upColor: 'green',
          downColor: 'red',
        })
        s.setData(data)
        chartSeriesRef.current.push(s)
      }

      const timeField = fields.find((f) => f.name.toLowerCase() === (options.timeField || 'time').toLowerCase())
      const otherFields = fields.filter(
        (f) =>
          f.name.toLowerCase() !== (options.timeField || 'time').toLowerCase() &&
          !(isCandleSeries && candleFieldNames.includes(f.name.toLowerCase())) &&
          f.type === 'number'
      )

      if (!timeField && otherFields.length > 0) {
        notifyError(['missing time field'])
        continue
      } else if (otherFields.length === 0) {
        continue
      }

      for (const field of otherFields) {
        const tf = timeField!
        const data: LineData[] = []
        for (let j = 0; j < tf.values.length; j++) {
          if (field.values[j] === null || field.values[j] === undefined) {
            continue
          }
          let time
          switch (tf.type) {
            case 'number':
              time = normalizeTimestamp(tf.values[j])
              break
            case 'string':
              time = tf.values[j] as string
              break
            case 'time':
              time = normalizeTimestamp(tf.values[j])
              break
            default:
              notifyError(['Unsupported time field type'])
              continue
          }

          if (time === undefined) {
            notifyError(['Invalid time value'])
            continue
          }
          const item = {
            time,
            value: field.values[j] as number,
          }
          data.push(item)
        }
        const series = chart.addSeries(LineSeries, {
          title: field.name,
        })
        series.setData(data)
        chartSeriesRef.current.push(series)
      }
    }

    return () => {
      if (chartSeriesRef.current.length > 0) {
        chartSeriesRef.current.forEach((series) => chart.removeSeries(series))
        chartSeriesRef.current = []
      }
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, options])

  useEffect(() => {
    chartRef.current?.resize(width, height)
  }, [chartRef, width, height])

  return (
    <>
      {error?.message && (
        <Alert severity="warning" title="ECharts Execution Error">
          {error.message}
        </Alert>
      )}

      {error?.stack && <pre>{error.stack}</pre>}

      {themeError?.message && (
        <Alert severity="warning" title="ECharts Custom Theme Error">
          {themeError.message}
        </Alert>
      )}

      <div className={cx(styles.wrapper)} style={{ width, height }}>
        <div ref={containerRef} className={cx(styles.wrapper, styles.container)} />
      </div>
    </>
  )
}
