-- Ordo's saints. Every fact points at where it came from (dbo.sources).
--
--   sources       where a fact came from: a book, a web page, a dataset
--   saints        one row per person (or archangel)
--   feasts        one row per celebration in the calendar, named exactly as
--                 the Ordo calendar names it, with its date and its bio
--   feast_saints  which people a feast celebrates (Peter and Paul: two)
--   patronages    causes and places a saint is patron of

CREATE TABLE dbo.sources (
  id           int IDENTITY PRIMARY KEY,
  kind         varchar(30)    NOT NULL,  -- butler-1894, vatican, wikipedia, wikidata, litcal
  title        nvarchar(300)  NOT NULL,
  url          nvarchar(500)  NOT NULL,
  license      nvarchar(100)  NULL,
  retrieved_on date           NULL,
  CONSTRAINT uq_sources_url UNIQUE (url)
);

CREATE TABLE dbo.saints (
  id                   int IDENTITY PRIMARY KEY,
  slug                 varchar(120)  NOT NULL,
  name                 nvarchar(200) NOT NULL,
  wikidata_id          varchar(20)   NULL,
  death_year           smallint      NULL,   -- negative = BC
  death_precision      varchar(10)   NULL,   -- day, month, year, decade, century
  death_source_id      int           NULL REFERENCES dbo.sources (id),
  -- Worked out from death_year, never stored twice: 1582 → 16th century.
  death_century AS (CASE WHEN death_year > 0 THEN (death_year - 1) / 100 + 1 END) PERSISTED,
  CONSTRAINT uq_saints_slug UNIQUE (slug),
  CONSTRAINT ck_saints_death CHECK (death_year IS NULL OR death_source_id IS NOT NULL)
);

CREATE TABLE dbo.feasts (
  id             int IDENTITY PRIMARY KEY,
  calendar_name  nvarchar(300) NOT NULL,  -- exactly as in ordo/calendar-<year>.json
  month          tinyint       NOT NULL CHECK (month BETWEEN 1 AND 12),
  day            tinyint       NOT NULL CHECK (day BETWEEN 1 AND 31),
  date_source_id int           NOT NULL REFERENCES dbo.sources (id),
  bio            nvarchar(max) NULL,
  bio_source_id  int           NULL REFERENCES dbo.sources (id),
  CONSTRAINT uq_feasts_name UNIQUE (calendar_name),
  CONSTRAINT ck_feasts_bio CHECK (bio IS NULL OR bio_source_id IS NOT NULL)
);

CREATE TABLE dbo.feast_saints (
  feast_id int NOT NULL REFERENCES dbo.feasts (id),
  saint_id int NOT NULL REFERENCES dbo.saints (id),
  PRIMARY KEY (feast_id, saint_id)
);

CREATE TABLE dbo.patronages (
  id          int IDENTITY PRIMARY KEY,
  saint_id    int           NOT NULL REFERENCES dbo.saints (id),
  patronage   nvarchar(200) NOT NULL,
  wikidata_id varchar(20)   NULL,
  source_id   int           NOT NULL REFERENCES dbo.sources (id),
  CONSTRAINT uq_patronages UNIQUE (saint_id, patronage)
);
