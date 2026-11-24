SELECT FORMAT_DATE('%Y-%m-%d', PARSE_DATE('%Y%m%d', event_date)) AS day,
  COUNT(DISTINCT user_pseudo_id) AS active_users,
  COUNT(DISTINCT IF(event_name = 'first_open', user_pseudo_id, NULL)) AS new_users,
  COUNTIF(event_name = 'session_start') AS sessions,
  COUNT(DISTINCT IF(COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'session_engaged'), CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'session_engaged') AS STRING)) = '1', CONCAT(user_pseudo_id, '-', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)), NULL)) AS engaged_sessions,
  ROUND(SUM(IFNULL((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0)) / 60000, 1) AS engagement_minutes,
  COUNTIF(event_name IN ('purchase', 'in_app_purchase')) AS purchases,
  ROUND(SUM(IFNULL(event_value_in_usd, 0)), 2) AS revenue_usd
FROM `tuktuki-54fa9.analytics_495378590.events_*`
WHERE _TABLE_SUFFIX BETWEEN GREATEST(REPLACE('{{start}}', '-', ''), '20261117') AND IFNULL(NULLIF(REPLACE('{{end}}', '-', ''), ''), FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)))
GROUP BY day ORDER BY day
