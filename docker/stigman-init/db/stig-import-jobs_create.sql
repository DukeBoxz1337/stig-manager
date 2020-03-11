SET ECHO ON
SET VERIFY ON
SET FEEDBACK OFF
SET DEFINE ON
CLEAR SCREEN
set serveroutput on

set define on;
connect sys/&&sys_pw as sysdba;
alter session set container=&&container_name;

PROMPT Creating Role &&stig_import_jobs_role ...
CREATE ROLE &&stig_import_jobs_role ;

-- PROMPT Drop stig_import_jobs user
-- drop user stig_import_jobs cascade;
   
PROMPT Create user stig_import_jobs
CREATE USER stig_import_jobs IDENTIFIED BY &&stig_import_jobs_password DEFAULT TABLESPACE USERS TEMPORARY TABLESPACE TEMP QUOTA UNLIMITED ON USERS;
GRANT CREATE SESSION, RESOURCE, CREATE VIEW, CREATE MATERIALIZED VIEW, CREATE SYNONYM, UNLIMITED TABLESPACE TO stig_import_jobs;


set define on
-- prompt connecting to stig_import_jobs
-- connect stig_import_jobs/&&stig_import_jobs_password@&&container_name;
-- set define off

-- DROP TABLE contents CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.contents ...
CREATE TABLE stig_import_jobs.contents (
  sha1 VARCHAR2(255 CHAR) NOT NULL,
  content BLOB NOT NULL,
  stored DATE NOT NULL
);


PROMPT Creating Primary Key Constraint PRIMARY on table stig_import_jobs.contents ... 
ALTER TABLE stig_import_jobs.contents
ADD CONSTRAINT PRIMARY PRIMARY KEY
(
  sha1
)
ENABLE
;

GRANT ALL ON stig_import_jobs.contents TO &&stig_import_jobs_role;
-- DROP TABLE import_errors CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.import_errors ...
CREATE TABLE stig_import_jobs.import_errors (
  jobId NUMBER(10,0),
  seq NUMBER(10,0),
  zipPath VARCHAR2(2048 CHAR),
  xccdfFilename VARCHAR2(255 CHAR),
  stigId VARCHAR2(255 CHAR),
  error VARCHAR2(32767 CHAR),
  errstr VARCHAR2(32767 CHAR)
);



GRANT ALL ON stig_import_jobs.import_errors TO &&stig_import_jobs_role;
-- DROP TABLE item_xccdf_map CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.item_xccdf_map ...
CREATE TABLE stig_import_jobs.item_xccdf_map (
  cxId NUMBER(10,0) GENERATED BY DEFAULT ON NULL AS IDENTITY ,
  sha1 VARCHAR2(255 CHAR) NOT NULL,
  xccdfId NUMBER(10,0) NOT NULL
);


PROMPT Creating Primary Key Constraint PRIMARY_1 on table stig_import_jobs.item_xccdf_map ... 
ALTER TABLE stig_import_jobs.item_xccdf_map
ADD CONSTRAINT PRIMARY_1 PRIMARY KEY
(
  cxId
)
ENABLE
;
PROMPT Creating Unique Constraint unique_columns on table stig_import_jobs.item_xccdf_map
ALTER TABLE stig_import_jobs.item_xccdf_map
ADD CONSTRAINT unique_columns UNIQUE (
  sha1,
  xccdfId
)
ENABLE
;

GRANT ALL ON stig_import_jobs.item_xccdf_map TO &&stig_import_jobs_role;
-- DROP TABLE items CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.items ...
CREATE TABLE stig_import_jobs.items (
  itemId NUMBER(10,0) GENERATED BY DEFAULT ON NULL AS IDENTITY ,
  description VARCHAR2(255 CHAR) NOT NULL,
  href VARCHAR2(255 CHAR) NOT NULL,
  title VARCHAR2(255 CHAR) NOT NULL,
  filename VARCHAR2(255 CHAR) NOT NULL,
  sha1 VARCHAR2(255 CHAR) NOT NULL,
  lastModified NUMBER(10,0) NOT NULL
);


ALTER TABLE stig_import_jobs.items MODIFY (lastModified DEFAULT '0');
PROMPT Creating Primary Key Constraint PRIMARY_6 on table stig_import_jobs.items ... 
ALTER TABLE stig_import_jobs.items
ADD CONSTRAINT PRIMARY_6 PRIMARY KEY
(
  itemId
)
ENABLE
;
PROMPT Creating Unique Constraint UNIQUE_COLUMNS_8 on table stig_import_jobs.items
ALTER TABLE stig_import_jobs.items
ADD CONSTRAINT UNIQUE_COLUMNS_8 UNIQUE (
  lastModified,
  description,
  filename,
  sha1,
  href,
  title
)
ENABLE
;

GRANT ALL ON stig_import_jobs.items TO &&stig_import_jobs_role;
-- DROP TABLE job_import_map CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.job_import_map ...
CREATE TABLE stig_import_jobs.job_import_map (
  sha1 VARCHAR2(45 CHAR) NOT NULL,
  jobId NUMBER(10,0)
);


PROMPT Creating Primary Key Constraint PRIMARY_3 on table stig_import_jobs.job_import_map ... 
ALTER TABLE stig_import_jobs.job_import_map
ADD CONSTRAINT PRIMARY_3 PRIMARY KEY
(
  sha1
)
ENABLE
;

GRANT ALL ON stig_import_jobs.job_import_map TO &&stig_import_jobs_role;
-- DROP TABLE job_item_map CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.job_item_map ...
CREATE TABLE stig_import_jobs.job_item_map (
  jiId NUMBER(10,0) GENERATED BY DEFAULT ON NULL AS IDENTITY ,
  jobId NUMBER(10,0) NOT NULL,
  itemId NUMBER(10,0) NOT NULL
);


PROMPT Creating Primary Key Constraint PRIMARY_4 on table stig_import_jobs.job_item_map ... 
ALTER TABLE stig_import_jobs.job_item_map
ADD CONSTRAINT PRIMARY_4 PRIMARY KEY
(
  jiId
)
ENABLE
;
PROMPT Creating Unique Constraint UNIQUE_COLUMNS_7 on table stig_import_jobs.job_item_map
ALTER TABLE stig_import_jobs.job_item_map
ADD CONSTRAINT UNIQUE_COLUMNS_7 UNIQUE (
  jobId,
  itemId
)
ENABLE
;

GRANT ALL ON stig_import_jobs.job_item_map TO &&stig_import_jobs_role;
-- DROP TABLE jobs CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.jobs ...
CREATE TABLE stig_import_jobs.jobs (
  jobId NUMBER(10,0) GENERATED BY DEFAULT ON NULL AS IDENTITY ,
  startTime DATE NOT NULL,
  requestUrl VARCHAR2(255 CHAR) NOT NULL,
  responseCode VARCHAR2(5 CHAR),
  response BLOB,
  responseHash VARCHAR2(255 CHAR),
  endTime DATE
);


PROMPT Creating Primary Key Constraint PRIMARY_5 on table stig_import_jobs.jobs ... 
ALTER TABLE stig_import_jobs.jobs
ADD CONSTRAINT PRIMARY_5 PRIMARY KEY
(
  jobId
)
ENABLE
;

GRANT ALL ON stig_import_jobs.jobs TO &&stig_import_jobs_role;
-- DROP TABLE xccdfs CASCADE CONSTRAINTS;


PROMPT Creating Table stig_import_jobs.xccdfs ...
CREATE TABLE stig_import_jobs.xccdfs (
  xccdfId NUMBER(10,0) GENERATED BY DEFAULT ON NULL AS IDENTITY ,
  filename VARCHAR2(255 CHAR) NOT NULL,
  sha1 VARCHAR2(255 CHAR) NOT NULL
);


PROMPT Creating Primary Key Constraint PRIMARY_2 on table stig_import_jobs.xccdfs ... 
ALTER TABLE stig_import_jobs.xccdfs
ADD CONSTRAINT PRIMARY_2 PRIMARY KEY
(
  xccdfId
)
ENABLE
;
PROMPT Creating Unique Constraint UNIQUE_COLUMNS_6 on table stig_import_jobs.xccdfs
ALTER TABLE stig_import_jobs.xccdfs
ADD CONSTRAINT UNIQUE_COLUMNS_6 UNIQUE (
  filename,
  sha1
)
ENABLE
;

GRANT ALL ON stig_import_jobs.xccdfs TO &&stig_import_jobs_role;
PROMPT Creating Index Index_1 on import_errors ...
CREATE INDEX Index_1 ON stig_import_jobs.import_errors
(
  jobId
) 
;

CREATE OR REPLACE TRIGGER job_item_map_jiId_TRG AFTER INSERT ON stig_import_jobs.job_item_map
FOR EACH ROW
DECLARE 
v_newVal NUMBER(12) := 0;
BEGIN
  v_newVal := :new.jiId;
  --used to emulate LAST_INSERT_ID()
  --mysql_utilities.identity := v_newVal; 
END;

/

CREATE OR REPLACE TRIGGER xccdfs_xccdfId_TRG AFTER INSERT ON stig_import_jobs.xccdfs
FOR EACH ROW
DECLARE 
v_newVal NUMBER(12) := 0;
BEGIN
  v_newVal := :new.xccdfId;
  --used to emulate LAST_INSERT_ID()
  --mysql_utilities.identity := v_newVal; 
END;

/

CREATE OR REPLACE TRIGGER jobs_jobId_TRG AFTER INSERT ON stig_import_jobs.jobs
FOR EACH ROW
DECLARE 
v_newVal NUMBER(12) := 0;
BEGIN
  v_newVal := :new.jobId;
  --used to emulate LAST_INSERT_ID()
  --mysql_utilities.identity := v_newVal; 
END;

/

CREATE OR REPLACE TRIGGER item_xccdf_map_cxId_TRG AFTER INSERT ON stig_import_jobs.item_xccdf_map
FOR EACH ROW
DECLARE 
v_newVal NUMBER(12) := 0;
BEGIN
  v_newVal := :new.cxId;
  --used to emulate LAST_INSERT_ID()
  --mysql_utilities.identity := v_newVal; 
END;

/

CREATE OR REPLACE TRIGGER items_itemId_TRG AFTER INSERT ON stig_import_jobs.items
FOR EACH ROW
DECLARE 
v_newVal NUMBER(12) := 0;
BEGIN
  v_newVal := :new.itemId;
  --used to emulate LAST_INSERT_ID()
  --mysql_utilities.identity := v_newVal; 
END;

/

spool off;

COMMIT;
