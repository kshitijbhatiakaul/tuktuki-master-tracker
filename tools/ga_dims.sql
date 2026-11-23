WITH e AS (
  SELECT user_pseudo_id, event_name, geo.country AS country, geo.region AS region, geo.city AS city, device.language AS language,
    app_info.version AS app_version, device.operating_system_version AS os_version,
    IFNULL((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0) AS eng
  FROM `tuktuki-54fa9.analytics_495378590.events_*`
  WHERE _TABLE_SUFFIX BETWEEN GREATEST(REPLACE('{{start}}', '-', ''), '20261117') AND IFNULL(NULLIF(REPLACE('{{end}}', '-', ''), ''), FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)))
), d AS (
  SELECT 'total' AS dim, 'all' AS val, user_pseudo_id, event_name, eng FROM e UNION ALL
  SELECT 'country', country, user_pseudo_id, event_name, eng FROM e UNION ALL
  SELECT 'region', region, user_pseudo_id, event_name, eng FROM e UNION ALL
  SELECT 'city', city, user_pseudo_id, event_name, eng FROM e UNION ALL
  SELECT 'language', language, user_pseudo_id, event_name, eng FROM e UNION ALL
  SELECT 'app_version', app_version, user_pseudo_id, event_name, eng FROM e UNION ALL
  SELECT 'os_version', os_version, user_pseudo_id, event_name, eng FROM e
)
SELECT dim, IFNULL(NULLIF(TRIM(val), ''), '(not set)') AS value, COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT IF(event_name = 'first_open', user_pseudo_id, NULL)) AS new_users,
  COUNTIF(event_name = 'session_start') AS sessions,
  ROUND(SUM(eng) / 60000 / COUNT(DISTINCT user_pseudo_id), 1) AS minutes_per_user
FROM d GROUP BY dim, value
QUALIFY ROW_NUMBER() OVER (PARTITION BY dim ORDER BY users DESC) <= 20
ORDER BY dim, users DESC
