/*
 * Opus EDM — plausible data, at a scale that changes what a scan says.
 *
 * ── WHY SEED AT ALL ─────────────────────────────────────────────────────────────────────
 * A schema with no rows scans perfectly and demonstrates almost nothing. Three of the pipeline's
 * judgements read `sys.partitions` and therefore read zero: cost class, the unfiltered-query threshold,
 * and drift's proportional row-count test. Enumeration sampling reads the data itself, so with no rows
 * it finds no code lists. The scan is correct and the screen is flat.
 *
 * So this puts real rows behind the schema — enough that `processing.LOAD_STEP` and `dq.DQ_EXCEPTION`
 * cross the million-row line and come back marked "needs a filter", and enough that sampling
 * `master.PRODUCT.CATEGORY` finds the six categories that are actually there.
 *
 * ── AND WHY IT IS HAND-WRITTEN WHERE THE DDL IS GENERATED ───────────────────────────────
 * The DDL is a mechanical restatement of the fixture, so generating it removes a transcription risk.
 * The *content* of the data is a judgement — which statuses are common, that most loads succeed and a
 * few are late, that exceptions skew towards OPEN — and generating it from the fixture would mean
 * inventing a way to describe distributions in the fixture. Written here, it is reviewable as what it
 * is: a plausible day in an EDM estate.
 *
 * Paired with `tools/fixture-ddl.mjs`. If a column is added to the fixture and not here, these inserts
 * fail loudly, which is the correct outcome.
 *
 * ── SET-BASED, NOT ROW-BY-ROW ───────────────────────────────────────────────────────────
 * Three and a half million single-row inserts would take longer than anybody will wait. Each table is
 * one statement over a numbers CTE built from `sys.all_objects`, which is the standard trick and takes
 * seconds. Values come from `% n` over the row number, so the distributions are deterministic — two
 * people running this see the same database, and so do two scans.
 */

USE [OpusEDM];
GO

SET NOCOUNT ON;
GO

-- Clear in dependency order, so this is re-runnable.
DELETE FROM processing.LOAD_STEP;
DELETE FROM processing.LOAD_RECONCILIATION;
DELETE FROM dq.DQ_EXCEPTION;
DELETE FROM processing.FILE_LOAD;
DELETE FROM vendor.VENDOR_FEED;
DELETE FROM dq.DQ_RULE;
DELETE FROM master.SECURITY_MASTER;
DELETE FROM master.LEGAL_ENTITY;
DELETE FROM master.CUSTOMER_ACCOUNT;
DELETE FROM master.PRODUCT;
DELETE FROM vendor.VENDOR;
DELETE FROM admin.ORGANISATION;
GO

/*
  A numbers generator, reused by every insert below.

  `sys.all_objects` cross-joined with itself gives a few million rows on any instance, which is more
  than enough and needs no permanent helper table.
*/
CREATE OR ALTER FUNCTION dbo.OpusSeedNumbers(@count bigint)
RETURNS TABLE
AS RETURN
  SELECT TOP (@count) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
  FROM sys.all_objects a CROSS JOIN sys.all_objects b;
GO

-- ── organisations (outside the scanned schemas; the dangling FK target) ────────────────
INSERT INTO admin.ORGANISATION (ORG_ID)
SELECT i FROM dbo.OpusSeedNumbers(40);
GO

-- ── vendors ───────────────────────────────────────────────────────────────────────────
SET IDENTITY_INSERT vendor.VENDOR ON;
INSERT INTO vendor.VENDOR
  (VENDOR_ID, VENDOR_CODE, VENDOR_NAME, VENDOR_STATUS, COUNTRY_CODE, CONTACT_EMAIL,
   ONBOARDED_DATE, SLA_HOURS, ORG_ID, REGION_SHAPE, UPDATED_AT_UTC)
SELECT
  i,
  CONCAT('VND', RIGHT('00000' + CAST(i AS varchar(5)), 5)),
  CONCAT(
    CHOOSE(1 + i % 8, N'Northwind', N'Kestrel', N'Aldgate', N'Brightwater', N'Fenchurch', N'Trellis', N'Halcyon', N'Ravensworth'),
    N' ',
    CHOOSE(1 + (i / 8) % 5, N'Data Services', N'Market Data', N'Analytics', N'Reference Data', N'Pricing')),
  -- Most vendors are active; a few are suspended and fewer terminated.
  CASE WHEN i % 23 = 0 THEN N'SUSPENDED' WHEN i % 97 = 0 THEN N'TERMINATED' ELSE N'ACTIVE' END,
  CHOOSE(1 + i % 6, 'GB', 'US', 'DE', 'SG', 'JP', 'AU'),
  CONCAT('feeds+', LOWER(CONCAT('vnd', i)), '@example.com'),
  DATEADD(day, -(i % 2000), CAST('2026-08-01' AS date)),
  CHOOSE(1 + i % 4, 2, 4, 8, 24),
  1 + i % 40,
  NULL,
  DATEADD(minute, -(i % 100000), CAST('2026-08-01T06:00:00' AS datetime2(3)))
FROM dbo.OpusSeedNumbers(1240);
SET IDENTITY_INSERT vendor.VENDOR OFF;
GO

SET IDENTITY_INSERT vendor.VENDOR_FEED ON;
INSERT INTO vendor.VENDOR_FEED
  (FEED_ID, VENDOR_ID, FEED_CODE, FEED_NAME, FEED_TYPE, DELIVERY_METHOD,
   EXPECTED_TIME_UTC, IS_CRITICAL, FEED_CONFIG_XML)
SELECT
  i,
  1 + (i % 1240),
  CONCAT('FEED-', RIGHT('00000' + CAST(i AS varchar(5)), 5)),
  CONCAT(CHOOSE(1 + i % 5, N'Daily Positions', N'Intraday Prices', N'Corporate Actions', N'Instrument Reference', N'Trade Feed'),
         N' ', CAST(i AS nvarchar(10))),
  CHOOSE(1 + i % 5, N'POSITIONS', N'PRICES', N'CORPORATE_ACTIONS', N'REFERENCE', N'TRANSACTIONS'),
  CHOOSE(1 + i % 4, N'SFTP', N'API', N'MQ', N'MANUAL'),
  CAST(DATEADD(minute, (i * 7) % 1440, CAST('00:00:00' AS time(0))) AS time(0)),
  CASE WHEN i % 5 = 0 THEN 1 ELSE 0 END,
  NULL
FROM dbo.OpusSeedNumbers(3800);
SET IDENTITY_INSERT vendor.VENDOR_FEED OFF;
GO

-- ── processing ────────────────────────────────────────────────────────────────────────
/*
  400,000 loads: below the million-row threshold on purpose, so the scan shows a `low` cost entity
  beside the two that are over it. A demo where everything is "high cost" says nothing about the rule.
*/
SET IDENTITY_INSERT processing.FILE_LOAD ON;
INSERT INTO processing.FILE_LOAD
  (LOAD_ID, FEED_ID, BUSINESS_DATE, FILE_NAME, LOAD_STATUS, ROWS_RECEIVED, ROWS_ACCEPTED,
   ROWS_REJECTED, LOAD_DURATION_SECONDS, RECEIVED_AT_UTC, COMPLETED_AT_UTC, RETRY_COUNT, FILE_CHECKSUM)
SELECT
  i,
  1 + (i % 3800),
  DATEADD(day, -(i % 400), CAST('2026-08-01' AS date)),
  CONCAT('feed_', 1 + (i % 3800), '_', FORMAT(DATEADD(day, -(i % 400), CAST('2026-08-01' AS date)), 'yyyyMMdd'), '.csv'),
  -- The realistic skew: most complete, a few late, fewer failed, a handful in flight.
  CASE
    WHEN i % 1000 = 0 THEN N'RUNNING'
    WHEN i % 251 = 0 THEN N'FAILED'
    WHEN i % 37 = 0 THEN N'LATE'
    WHEN i % 1499 = 0 THEN N'PENDING'
    ELSE N'COMPLETE'
  END,
  50000 + (i % 900000),
  50000 + (i % 900000) - (i % 137),
  i % 137,
  CASE WHEN i % 1000 = 0 THEN NULL ELSE 20 + (i % 3600) END,
  DATEADD(second, -(i % 3000000), CAST('2026-08-01T06:00:00' AS datetime2(3))),
  CASE WHEN i % 1000 = 0 THEN NULL
       ELSE DATEADD(second, -(i % 3000000) + 20 + (i % 3600), CAST('2026-08-01T06:00:00' AS datetime2(3))) END,
  CASE WHEN i % 251 = 0 THEN 1 + i % 3 ELSE 0 END,
  NULL
FROM dbo.OpusSeedNumbers(400000);
SET IDENTITY_INSERT processing.FILE_LOAD OFF;
GO

/*
  Four steps per load: 1,600,000 rows, which is what puts this entity over the threshold and makes the
  scan mark it "needs a filter" for a reason a viewer can check.
*/
INSERT INTO processing.LOAD_STEP (LOAD_ID, STEP_NO, STEP_NAME, STEP_STATUS, ELAPSED_MS, ERROR_MESSAGE, STARTED_AT_UTC)
SELECT
  l.LOAD_ID,
  s.i,
  CHOOSE(s.i, N'Parse', N'Validate', N'Transform', N'Publish'),
  CASE WHEN l.LOAD_STATUS = N'FAILED' AND s.i = 2 THEN N'FAILED'
       WHEN l.LOAD_STATUS = N'RUNNING' AND s.i > 2 THEN N'PENDING'
       WHEN l.LOAD_STATUS = N'PENDING' THEN N'PENDING'
       ELSE N'COMPLETE' END,
  50 + (CAST(l.LOAD_ID AS int) * s.i) % 90000,
  CASE WHEN l.LOAD_STATUS = N'FAILED' AND s.i = 2
       THEN CONCAT(N'Rule ', 1 + l.LOAD_ID % 860, N' rejected ', l.ROWS_REJECTED, N' rows') END,
  DATEADD(second, (s.i - 1) * 30, l.RECEIVED_AT_UTC)
FROM processing.FILE_LOAD l
CROSS JOIN dbo.OpusSeedNumbers(4) s;
GO

INSERT INTO processing.LOAD_RECONCILIATION (LOAD_ID, BUSINESS_DATE, SOURCE_ROW_COUNT, TARGET_ROW_COUNT, VARIANCE_PCT)
SELECT TOP (12000)
  l.LOAD_ID, l.BUSINESS_DATE, l.ROWS_RECEIVED, l.ROWS_ACCEPTED,
  CASE WHEN l.ROWS_RECEIVED = 0 THEN NULL
       ELSE CAST(100.0 * l.ROWS_REJECTED / l.ROWS_RECEIVED AS decimal(9, 4)) END
FROM processing.FILE_LOAD l
ORDER BY l.LOAD_ID;
GO

-- ── data quality ──────────────────────────────────────────────────────────────────────
SET IDENTITY_INSERT dq.DQ_RULE ON;
INSERT INTO dq.DQ_RULE (RULE_ID, RULE_CODE, RULE_NAME, RULE_DESCRIPTION, RULE_DOMAIN, SEVERITY, IS_BLOCKING, TOLERANCE_PCT)
SELECT
  i,
  CONCAT('DQ-', RIGHT('0000' + CAST(i AS varchar(4)), 4)),
  CONCAT(CHOOSE(1 + i % 6, N'Missing', N'Stale', N'Out of range', N'Unmatched', N'Duplicate', N'Inconsistent'),
         N' ',
         CHOOSE(1 + (i / 6) % 5, N'price', N'identifier', N'currency', N'counterparty', N'quantity')),
  CONCAT(N'Raised when the ', CHOOSE(1 + (i / 6) % 5, N'price', N'identifier', N'currency', N'counterparty', N'quantity'),
         N' fails its expected condition on ingestion.'),
  CHOOSE(1 + i % 5, N'SECURITY', N'COUNTERPARTY', N'PRICE', N'POSITION', N'CUSTOMER'),
  CASE WHEN i % 19 = 0 THEN N'CRITICAL' WHEN i % 5 = 0 THEN N'HIGH' WHEN i % 3 = 0 THEN N'MEDIUM' ELSE N'LOW' END,
  CASE WHEN i % 19 = 0 THEN 1 ELSE 0 END,
  CAST((i % 500) / 100.0 AS decimal(9, 4))
FROM dbo.OpusSeedNumbers(860);
SET IDENTITY_INSERT dq.DQ_RULE OFF;
GO

/*
  1,200,000 exceptions. Over the threshold, and skewed the way a real queue is: mostly OPEN and
  RESOLVED, with a long tail of waived and rejected.
*/
SET IDENTITY_INSERT dq.DQ_EXCEPTION ON;
INSERT INTO dq.DQ_EXCEPTION
  (EXCEPTION_ID, RULE_ID, LOAD_ID, SUBJECT_TYPE, SUBJECT_KEY, EXCEPTION_STATUS, ASSIGNED_TO_USER,
   DETECTED_AT_UTC, RESOLVED_AT_UTC, AGE_HOURS, IMPACT_AMOUNT, IMPACT_CCY, RESOLUTION_NOTE)
SELECT
  i,
  1 + (i % 860),
  CASE WHEN i % 11 = 0 THEN NULL ELSE 1 + (i % 400000) END,
  CHOOSE(1 + i % 4, N'SECURITY', N'LEGAL_ENTITY', N'CUSTOMER_ACCOUNT', N'PRODUCT'),
  CONCAT(CHOOSE(1 + i % 4, 'SEC', 'LEI', 'ACC', 'SKU'), '-', RIGHT('000000' + CAST(i % 240000 AS varchar(6)), 6)),
  CASE
    WHEN i % 3 = 0 THEN N'RESOLVED'
    WHEN i % 7 = 0 THEN N'INVESTIGATING'
    WHEN i % 29 = 0 THEN N'WAIVED'
    WHEN i % 53 = 0 THEN N'REJECTED'
    ELSE N'OPEN'
  END,
  CASE WHEN i % 4 = 0 THEN NULL
       ELSE CHOOSE(1 + i % 6, N'a.patel', N'j.okafor', N'm.lindqvist', N's.tanaka', N'r.dubois', N'k.novak') END,
  DATEADD(minute, -(i % 500000), CAST('2026-08-01T06:00:00' AS datetime2(3))),
  CASE WHEN i % 3 = 0 THEN DATEADD(minute, -(i % 500000) + 60 + (i % 4000), CAST('2026-08-01T06:00:00' AS datetime2(3))) END,
  (i % 4000) + 1,
  CASE WHEN i % 6 = 0 THEN NULL ELSE CAST((i % 9000000) / 100.0 AS decimal(19, 4)) END,
  CASE WHEN i % 6 = 0 THEN NULL ELSE CHOOSE(1 + i % 5, 'GBP', 'USD', 'EUR', 'JPY', 'SGD') END,
  CASE WHEN i % 3 = 0 THEN CHOOSE(1 + i % 4,
    N'Vendor resent the file; values now match.',
    N'Confirmed correct at source — tolerance widened.',
    N'Duplicate of an earlier exception on the same key.',
    N'Manual correction applied and signed off.') END
FROM dbo.OpusSeedNumbers(1200000);
SET IDENTITY_INSERT dq.DQ_EXCEPTION OFF;
GO

-- ── mastered data ─────────────────────────────────────────────────────────────────────
INSERT INTO master.SECURITY_MASTER
  (SECURITY_ID, ISIN, SEDOL, CUSIP, FIGI, SECURITY_NAME, ASSET_CLASS, CURRENCY_CODE,
   ISSUE_DATE, MATURITY_DATE, GOLDEN_SOURCE_VENDOR_ID, MATCH_CONFIDENCE_PCT, IS_ACTIVE)
SELECT
  -- Deterministic GUIDs, so two runs produce the same database.
  CAST(CAST(HASHBYTES('MD5', CONCAT('SEC', i)) AS binary(16)) AS uniqueidentifier),
  CONCAT(CHOOSE(1 + i % 6, 'GB', 'US', 'DE', 'SG', 'JP', 'AU'), RIGHT('0000000000' + CAST(i AS varchar(10)), 10)),
  RIGHT('0000000' + CAST(i AS varchar(7)), 7),
  RIGHT('000000000' + CAST(i AS varchar(9)), 9),
  CONCAT('BBG', RIGHT('000000000' + CAST(i AS varchar(9)), 9)),
  CONCAT(CHOOSE(1 + i % 8, N'Northgate', N'Vela', N'Merrion', N'Castleford', N'Anselm', N'Perigee', N'Larkspur', N'Ravel'),
         N' ',
         CHOOSE(1 + (i / 8) % 6, N'Holdings plc', N'Industries Inc', N'Group AG', N'Trust', N'Partners LP', N'Corporation')),
  CHOOSE(1 + i % 6, N'EQUITY', N'BOND', N'FUND', N'DERIVATIVE', N'FX', N'COMMODITY'),
  CHOOSE(1 + i % 5, 'GBP', 'USD', 'EUR', 'JPY', 'SGD'),
  DATEADD(day, -(i % 9000), CAST('2026-08-01' AS date)),
  CASE WHEN i % 6 IN (1, 3) THEN DATEADD(day, (i % 4000), CAST('2026-08-01' AS date)) END,
  1 + (i % 1240),
  -- Mastering confidence: mostly high, which is what makes a "higher is better" measure meaningful.
  CAST(70 + (i % 300) / 10.0 AS decimal(5, 2)),
  CASE WHEN i % 47 = 0 THEN 0 ELSE 1 END
FROM dbo.OpusSeedNumbers(240000);
GO

INSERT INTO master.LEGAL_ENTITY
  (LEGAL_ENTITY_ID, LEI, ENTITY_NAME, ENTITY_TYPE, DOMICILE_COUNTRY, PARENT_LEGAL_ENTITY_ID,
   KYC_STATUS, RISK_RATING, VAT_NUMBER, LAST_REVIEWED_DATE)
SELECT
  CAST(CAST(HASHBYTES('MD5', CONCAT('LE', i)) AS binary(16)) AS uniqueidentifier),
  CONCAT('LEI', RIGHT('00000000000000000' + CAST(i AS varchar(17)), 17)),
  CONCAT(CHOOSE(1 + i % 7, N'Ashcombe', N'Belvoir', N'Cranleigh', N'Dunmore', N'Elmsworth', N'Farrington', N'Glenbrook'),
         N' ', CHOOSE(1 + (i / 7) % 4, N'Capital', N'Asset Management', N'Securities', N'Investments')),
  CHOOSE(1 + i % 6, N'CORPORATE', N'FUND', N'SOVEREIGN', N'BANK', N'INSURER', N'SPV'),
  CHOOSE(1 + i % 6, 'GB', 'US', 'DE', 'SG', 'JP', 'AU'),
  -- Self-referencing: the first 400 are parents, the rest hang off them.
  CASE WHEN i > 400 THEN CAST(CAST(HASHBYTES('MD5', CONCAT('LE', 1 + i % 400)) AS binary(16)) AS uniqueidentifier) END,
  CASE WHEN i % 13 = 0 THEN N'PENDING' WHEN i % 71 = 0 THEN N'EXPIRED' WHEN i % 211 = 0 THEN N'REJECTED' ELSE N'APPROVED' END,
  CASE WHEN i % 17 = 0 THEN N'HIGH' WHEN i % 3 = 0 THEN N'MEDIUM' ELSE N'LOW' END,
  CONCAT(CHOOSE(1 + i % 6, 'GB', 'US', 'DE', 'SG', 'JP', 'AU'), RIGHT('000000000' + CAST(i AS varchar(9)), 9)),
  DATEADD(day, -(i % 900), CAST('2026-08-01' AS date))
FROM dbo.OpusSeedNumbers(64000);
GO

INSERT INTO master.CUSTOMER_ACCOUNT
  (ACCOUNT_ID, CUSTOMER_NAME, ACCOUNT_NUMBER, TAX_ID, DATE_OF_BIRTH, EMAIL, POSTCODE,
   SEGMENT, BALANCE_AMOUNT, BALANCE_CCY, OPENED_DATE, IS_CLOSED)
SELECT
  CAST(CAST(HASHBYTES('MD5', CONCAT('ACC', i)) AS binary(16)) AS uniqueidentifier),
  CONCAT(CHOOSE(1 + i % 8, N'Aoife', N'Bruno', N'Chiara', N'Devan', N'Elif', N'Farid', N'Gita', N'Hana'),
         N' ',
         CHOOSE(1 + (i / 8) % 8, N'Barnes', N'Castellano', N'Dlamini', N'Eriksen', N'Fitzgerald', N'Gupta', N'Halvorsen', N'Ibrahim')),
  CONCAT('GB', RIGHT('00' + CAST(i % 100 AS varchar(2)), 2), 'OPUS', RIGHT('00000000' + CAST(i AS varchar(8)), 8)),
  CONCAT('TX', RIGHT('000000000' + CAST(i AS varchar(9)), 9)),
  DATEADD(day, -(7000 + (i % 18000)), CAST('2026-08-01' AS date)),
  CONCAT(LOWER(CONCAT('customer', i)), '@example.com'),
  CONCAT(CHOOSE(1 + i % 5, 'EC1A', 'SW1A', 'M1', 'EH1', 'CF10'), ' ', 1 + i % 9, CHAR(65 + i % 26), CHAR(65 + (i / 26) % 26)),
  CASE WHEN i % 53 = 0 THEN N'PRIVATE' WHEN i % 11 = 0 THEN N'AFFLUENT' WHEN i % 7 = 0 THEN N'BUSINESS' ELSE N'MASS' END,
  CAST((i % 40000000) / 100.0 AS decimal(19, 4)),
  CHOOSE(1 + i % 5, 'GBP', 'USD', 'EUR', 'JPY', 'SGD'),
  DATEADD(day, -(i % 6000), CAST('2026-08-01' AS date)),
  CASE WHEN i % 29 = 0 THEN 1 ELSE 0 END
FROM dbo.OpusSeedNumbers(89000);
GO

/*
  CATEGORY is the column with no CHECK constraint, so only enumeration sampling can discover that it
  holds six values. These are those six.
*/
SET IDENTITY_INSERT master.PRODUCT ON;
INSERT INTO master.PRODUCT
  (PRODUCT_ID, SKU, PRODUCT_NAME, CATEGORY, UNIT_OF_MEASURE, LIST_PRICE_AMOUNT, LIST_PRICE_CCY,
   SHELF_LIFE_DAYS, ACTIVE_FLAG)
SELECT
  i,
  CONCAT('SKU-', RIGHT('000000' + CAST(i AS varchar(6)), 6)),
  CONCAT(CHOOSE(1 + i % 6, N'Ambient', N'Chilled', N'Frozen', N'Hardware', N'Packaging', N'Spares'),
         N' item ', CAST(i AS nvarchar(10))),
  CHOOSE(1 + i % 6, N'Ambient', N'Chilled', N'Frozen', N'Hardware', N'Packaging', N'Spares'),
  CHOOSE(1 + i % 6, N'EA', N'KG', N'L', N'M', N'BOX', N'PALLET'),
  CAST((i % 500000) / 100.0 AS decimal(19, 4)),
  CHOOSE(1 + i % 5, 'GBP', 'USD', 'EUR', 'JPY', 'SGD'),
  CASE WHEN i % 6 IN (1, 2, 3) THEN CAST(30 + (i % 700) AS decimal(5, 0)) END,
  CASE WHEN i % 41 = 0 THEN 0 ELSE 1 END
FROM dbo.OpusSeedNumbers(74000);
SET IDENTITY_INSERT master.PRODUCT OFF;
GO

DROP FUNCTION IF EXISTS dbo.OpusSeedNumbers;
GO

/*
  What the scan will see.

  `sys.partitions.rows` for index 0 or 1 is maintained by the engine as rows are written, so no
  statistics update is needed to make it accurate — and `sp_updatestats`, which an earlier version of
  this called, walks every system table and prints two hundred lines about the SQL Agent.
*/
SELECT s.name AS [schema], t.name AS [table], SUM(p.rows) AS [rows]
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY s.name, t.name
ORDER BY s.name, t.name;
GO
