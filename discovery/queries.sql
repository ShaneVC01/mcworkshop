-- count_systemnote_1d (11/11/2026 12:23, 1 rows)
SELECT COUNT(*) AS n FROM systemnote WHERE date >= SYSDATE - 1;

-- systemnote_sample_1d (11/11/2026 12:24, 21 rows)
SELECT * FROM systemnote WHERE date >= SYSDATE - 1;

-- probe_transaction (11/11/2026 12:54, 1 rows)
SELECT COUNT(*) AS n FROM transaction;

-- probe_task (11/11/2026 12:54, 1 rows)
SELECT COUNT(*) AS n FROM task;

-- probe_calendarevent (11/11/2026 12:54, 1 rows)
SELECT COUNT(*) AS n FROM calendarevent;

-- probe_item (11/11/2026 12:54, 1 rows)
SELECT COUNT(*) AS n FROM item;

-- probe_location (11/11/2026 12:54, 1 rows)
SELECT COUNT(*) AS n FROM location;

-- probe_nx_asset (11/11/2026 12:54, 1 rows)
SELECT COUNT(*) AS n FROM customrecord_nx_asset;

-- task_sample (11/11/2026 12:56, 3 rows)
SELECT * FROM task WHERE createddate >= ADD_MONTHS(SYSDATE, -2);

-- count_task_60d (11/11/2026 12:56, 1 rows)
SELECT COUNT(*) AS n FROM task WHERE createddate >= ADD_MONTHS(SYSDATE, -2);

-- count_task_modified_60d (11/11/2026 12:56, 1 rows)
SELECT COUNT(*) AS n FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- count_timebill_60d (11/11/2026 12:57, 1 rows)
SELECT COUNT(*) AS n FROM timebill WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- count_asset_60d (11/11/2026 12:57, 1 rows)
SELECT COUNT(*) AS n FROM customrecord_nx_asset WHERE lastmodified >= ADD_MONTHS(SYSDATE, -2);

-- count_tran_by_type (11/11/2026 12:57, 6 rows)
SELECT type, COUNT(*) AS n FROM transaction WHERE trandate >= ADD_MONTHS(SYSDATE, -2) GROUP BY type;

-- agg_task_status (11/11/2026 12:57, 3 rows)
SELECT status, COUNT(*) AS n FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2) GROUP BY status;

-- agg_task_type (11/11/2026 12:57, 2 rows)
SELECT BUILTIN.DF(custevent_nx_task_type) AS task_type, COUNT(*) AS n FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2) GROUP BY BUILTIN.DF(custevent_nx_task_type);

-- agg_task_outcome (11/11/2026 12:57, 4 rows)
SELECT BUILTIN.DF(custevent_nx_task_outcome) AS outcome, BUILTIN.DF(custevent_nxc_task_result) AS result, COUNT(*) AS n FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2) GROUP BY BUILTIN.DF(custevent_nx_task_outcome), BUILTIN.DF(custevent_nxc_task_result);

-- agg_task_billing (11/11/2026 12:57, 3 rows)
SELECT BUILTIN.DF(custevent_nx_billing_type) AS billing_type, BUILTIN.DF(custevent_nx_created_from) AS created_from, COUNT(*) AS n FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2) GROUP BY BUILTIN.DF(custevent_nx_billing_type), BUILTIN.DF(custevent_nx_created_from);

-- agg_task_assigned (11/11/2026 12:57, 24 rows)
SELECT BUILTIN.DF(assigned) AS technician, COUNT(*) AS n FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2) GROUP BY BUILTIN.DF(assigned);

-- tasks_60d (11/11/2026 12:58, 2527 rows)
SELECT t.*, BUILTIN.DF(t.assigned) AS assigned_name, BUILTIN.DF(t.custevent_nx_task_type) AS task_type_name, BUILTIN.DF(t.custevent_nx_task_outcome) AS outcome_name, BUILTIN.DF(t.custevent_nxc_task_result) AS result_name, BUILTIN.DF(t.custevent_nx_billing_type) AS billing_name, BUILTIN.DF(t.custevent_nx_created_from) AS created_from_name, BUILTIN.DF(t.custevent_nx_task_skill) AS skill_name FROM task t WHERE t.lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- transactions_changed_60d (11/11/2026 12:59, 2996 rows)
SELECT t.id, t.type, t.lastmodifieddate FROM transaction t WHERE t.type IN ('Estimate','SalesOrd','CustInvc') AND t.lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.tranid AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.trandate AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.createddate AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.status AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, BUILTIN.DF(t.status) AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.entity AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.foreigntotal AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.employee AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.memo AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.postingperiod AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.currency AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.subsidiary AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.location AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- col_probe (11/11/2026 12:59, 2 rows)
SELECT t.id, t.trandisplayname AS v FROM transaction t WHERE t.type IN ('Estimate') AND t.trandate >= ADD_MONTHS(SYSDATE, -2);

-- transactions_60d (11/11/2026 13:00, 5573 rows)
SELECT t.id, t.tranid, t.type, t.trandate, t.createddate, t.lastmodifieddate, t.status, BUILTIN.DF(t.status) AS status_name, t.entity, t.foreigntotal, t.employee, BUILTIN.DF(t.employee) AS employee_name, t.subsidiary, t.location, BUILTIN.DF(t.location) AS location_name, t.postingperiod FROM transaction t WHERE t.type IN ('Estimate','SalesOrd','CustInvc','ItemShip','CustPymt','PurchOrd') AND (t.trandate >= ADD_MONTHS(SYSDATE, -2) OR t.lastmodifieddate >= ADD_MONTHS(SYSDATE, -2));

-- links_60d (11/11/2026 13:00, 8547 rows)
SELECT l.previousdoc, l.nextdoc, l.linktype FROM nexttransactionlink l WHERE l.nextdoc IN (SELECT id FROM transaction WHERE trandate >= ADD_MONTHS(SYSDATE, -2) OR lastmodifieddate >= ADD_MONTHS(SYSDATE, -2)) OR l.previousdoc IN (SELECT id FROM transaction WHERE trandate >= ADD_MONTHS(SYSDATE, -2) OR lastmodifieddate >= ADD_MONTHS(SYSDATE, -2));

-- timebills_60d (11/11/2026 13:00, 634 rows)
SELECT b.*, BUILTIN.DF(b.employee) AS employee_name, BUILTIN.DF(b.item) AS item_name FROM timebill b WHERE b.lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- lines_probe (11/11/2026 13:01, 5 rows)
SELECT tl.*, BUILTIN.DF(tl.item) AS item_name FROM transactionline tl WHERE tl.transaction IN (SELECT id FROM transaction WHERE type = 'SalesOrd' AND trandate >= ADD_MONTHS(SYSDATE, -2));

-- lines_60d (11/11/2026 13:03, 47413 rows)
SELECT tl.transaction, tl.id AS line_id, tl.linesequencenumber, tl.item, BUILTIN.DF(tl.item) AS item_name, tl.itemtype, tl.quantity, tl.rate, tl.netamount, tl.isbillable, tl.isclosed, tl.location, tl.linecreateddate, tl.linelastmodifieddate FROM transactionline tl WHERE tl.mainline = 'F' AND tl.taxline = 'F' AND tl.transaction IN (SELECT id FROM transaction WHERE type IN ('Estimate','SalesOrd','CustInvc','ItemShip') AND (trandate >= ADD_MONTHS(SYSDATE, -2) OR lastmodifieddate >= ADD_MONTHS(SYSDATE, -2)));

-- assets_60d (11/11/2026 13:03, 1029 rows)
SELECT a.id, a.created, a.lastmodified, a.isinactive, a.custrecord_nxc_na_odometerunit, a.custrecordnxc_na_yearmodel, a.custrecord_nxc_na_fueltype, a.custrecord_nxc_na_transmissiontype, a.custrecord_nxc_na_bodytype, a.custrecord_nxc_na_cylinders, a.custrecord_vehicle_subtype, a.custrecord_ajg_next_service_date, a.custrecord_nxc_asset_is_installed FROM customrecord_nx_asset a WHERE a.lastmodified >= ADD_MONTHS(SYSDATE, -2);

-- sn_day_probe (11/11/2026 13:07, 0 rows)
SELECT * FROM systemnote WHERE date >= TO_DATE('2026-11-09','YYYY-MM-DD') AND date < TO_DATE('2026-11-10','YYYY-MM-DD');

-- sn_day_probe (11/11/2026 13:07, 0 rows)
SELECT * FROM systemnote WHERE date >= SYSDATE - 3 AND date < SYSDATE - 2;

-- sn_week_probe (11/11/2026 13:07, 21 rows)
SELECT * FROM systemnote WHERE date >= SYSDATE - 7;

-- sn_week_probe2 (11/11/2026 13:51, 21 rows)
SELECT * FROM systemnote WHERE date >= SYSDATE - 7;

-- probe3_supportcase (11/11/2026 13:58, 1 rows)
SELECT COUNT(*) AS n FROM supportcase;

-- probe3_employee (11/11/2026 13:58, 1 rows)
SELECT COUNT(*) AS n FROM employee;

-- probe3_job (11/11/2026 13:58, 1 rows)
SELECT COUNT(*) AS n FROM job;

-- sn_week_probe3 (11/11/2026 13:59, 21 rows)
SELECT * FROM systemnote WHERE date >= SYSDATE - 7;

-- count_cases_60d (11/11/2026 13:59, 1 rows)
SELECT COUNT(*) AS n FROM supportcase WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- employees (11/11/2026 13:59, 74 rows)
SELECT e.id, e.title AS job_title, BUILTIN.DF(e.department) AS department_name, BUILTIN.DF(e.location) AS location_name, e.isinactive, e.issupportrep, e.isjobresource, e.hiredate, e.releasedate FROM employee e;

-- cases_60d (11/11/2026 14:00, 973 rows)
SELECT c.id, c.casenumber, c.createddate, c.lastmodifieddate, c.startdate, c.enddate, c.status, BUILTIN.DF(c.status) AS status_name, c.assigned, BUILTIN.DF(c.assigned) AS assigned_name, c.company, c.origin, BUILTIN.DF(c.origin) AS origin_name, c.priority, BUILTIN.DF(c.priority) AS priority_name, c.category, BUILTIN.DF(c.category) AS category_name, c.issue, BUILTIN.DF(c.issue) AS issue_name, c.custevent_nx_case_type, BUILTIN.DF(c.custevent_nx_case_type) AS case_type_name, c.custevent_nx_case_asset, c.custevent_nx_case_transaction, c.custevent_created_from_quote, c.custevent_nxc_est_hours, c.custevent_odometer_reading, c.custevent_nxc_maintenance, c.custevent_nxc_repair, c.custevent_nxc_installation, c.custevent_nxc_job_subtype, BUILTIN.DF(c.custevent_nxc_job_subtype) AS job_subtype_name, BUILTIN.DF(c.custevent_ajg_deparmtnet_for_so) AS so_department_name, c.custevent_sms_job_confirm, c.custevent_nxc_case_vos, c.subsidiary FROM supportcase c WHERE c.lastmodifieddate >= ADD_MONTHS(SYSDATE, -2);

-- notes_cases_60d (11/11/2026 15:10, 974 rows, RAW)
SELECT id, title, custevent_nx_case_details AS details, custevent_nxc_cef_jobdetails AS jobdetails FROM supportcase WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE,-2);

-- notes_tasks_60d (11/11/2026 15:10, 2413 rows, RAW)
SELECT id, title, message FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE,-2) AND message IS NOT NULL;

-- notes_transactions_60d (11/11/2026 15:10, 60 rows, RAW)
SELECT id, type, memo, custbody_altas_anz_so_po_notes AS notes FROM transaction WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE,-2) AND (memo IS NOT NULL OR custbody_altas_anz_so_po_notes IS NOT NULL);

-- notes_assets_60d (11/11/2026 15:10, 63 rows, RAW)
SELECT id, custrecord2 AS notes FROM customrecord_nx_asset WHERE lastmodified >= ADD_MONTHS(SYSDATE,-2) AND custrecord2 IS NOT NULL;

-- employees_named (11/11/2026 15:10, 74 rows, RAW)
SELECT id, firstname, lastname, title, BUILTIN.DF(department) AS department, BUILTIN.DF(supervisor) AS supervisor, isinactive, hiredate, releasedate, comments FROM employee;

-- notes_task_outcomes_60d (11/11/2026 15:12, 306 rows, RAW)
SELECT id, supportcase, custevent_nx_actions_taken AS actions_taken, custevent_nxc_reason_not_resolved AS reason_not_resolved FROM task WHERE lastmodifieddate >= ADD_MONTHS(SYSDATE,-2) AND (custevent_nx_actions_taken IS NOT NULL OR custevent_nxc_reason_not_resolved IS NOT NULL);

-- lib_make_count (12/11/2026 20:03, 1 rows)
SELECT COUNT(*) AS n, SUM(CASE WHEN isinactive='T' THEN 1 ELSE 0 END) AS inactive FROM customrecord_ajg_make;

-- lib_model_count (12/11/2026 20:03, 1 rows)
SELECT COUNT(*) AS n, SUM(CASE WHEN isinactive='T' THEN 1 ELSE 0 END) AS inactive, SUM(CASE WHEN custrecord_make IS NULL THEN 1 ELSE 0 END) AS no_make FROM customrecord_ajg_make_model;

-- lib_makes (12/11/2026 20:03, 62 rows)
SELECT id, name, abbreviation, isinactive, lastmodified FROM customrecord_ajg_make;

-- lib_models (12/11/2026 20:03, 591 rows)
SELECT id, name, custrecord_agj_model AS model, custrecord_make AS make_id, abbreviation, isinactive, lastmodified FROM customrecord_ajg_make_model;

-- v_probe (12/11/2026 20:35, 1 rows, RAW)
SELECT COUNT(*) AS total, SUM(CASE WHEN custrecord_nxc_na_model IS NOT NULL THEN 1 ELSE 0 END) AS with_model, SUM(CASE WHEN custrecord_nxc_na_brandmake IS NOT NULL THEN 1 ELSE 0 END) AS with_make, SUM(CASE WHEN isinactive='T' THEN 1 ELSE 0 END) AS inactive, SUM(CASE WHEN custrecordnxc_na_yearmodel IS NOT NULL THEN 1 ELSE 0 END) AS with_year, SUM(CASE WHEN custrecord_nxc_na_fueltype IS NOT NULL THEN 1 ELSE 0 END) AS with_fuel, SUM(CASE WHEN custrecord_nxc_na_bodytype IS NOT NULL THEN 1 ELSE 0 END) AS with_body FROM customrecord_nx_asset;

-- v_links (12/11/2026 20:35, 6 rows, RAW)
SELECT BUILTIN.DF(a.custrecord_nxc_na_model) AS model_name, BUILTIN.DF(a.custrecord_nxc_na_brandmake) AS make_name, a.custrecord_nxc_na_model AS model_id, a.custrecord_nxc_na_brandmake AS make_id FROM customrecord_nx_asset a WHERE ROWNUM <= 6;

-- v_model_stats (12/11/2026 20:35, 569 rows, RAW)
SELECT a.custrecord_nxc_na_model AS model_id, COUNT(*) AS vehicles, MIN(CASE WHEN a.custrecordnxc_na_yearmodel BETWEEN 1950 AND 2027 THEN a.custrecordnxc_na_yearmodel END) AS min_year, MAX(CASE WHEN a.custrecordnxc_na_yearmodel BETWEEN 1950 AND 2027 THEN a.custrecordnxc_na_yearmodel END) AS max_year FROM customrecord_nx_asset a WHERE a.custrecord_nxc_na_model IS NOT NULL GROUP BY a.custrecord_nxc_na_model;

-- v_model_fuel (12/11/2026 20:35, 664 rows, RAW)
SELECT a.custrecord_nxc_na_model AS model_id, a.custrecord_nxc_na_fueltype AS fuel, COUNT(*) AS n FROM customrecord_nx_asset a WHERE a.custrecord_nxc_na_model IS NOT NULL AND a.custrecord_nxc_na_fueltype IS NOT NULL GROUP BY a.custrecord_nxc_na_model, a.custrecord_nxc_na_fueltype;

-- v_model_body (12/11/2026 20:36, 1078 rows, RAW)
SELECT a.custrecord_nxc_na_model AS model_id, a.custrecord_nxc_na_bodytype AS body, COUNT(*) AS n FROM customrecord_nx_asset a WHERE a.custrecord_nxc_na_model IS NOT NULL AND a.custrecord_nxc_na_bodytype IS NOT NULL GROUP BY a.custrecord_nxc_na_model, a.custrecord_nxc_na_bodytype;

-- v_model_subtype (12/11/2026 20:36, 1969 rows, RAW)
SELECT a.custrecord_nxc_na_model AS model_id, BUILTIN.DF(c.custevent_nxc_job_subtype) AS subtype, COUNT(*) AS n FROM supportcase c JOIN customrecord_nx_asset a ON a.id = c.custevent_nx_case_asset WHERE a.custrecord_nxc_na_model IS NOT NULL AND c.custevent_nxc_job_subtype IS NOT NULL GROUP BY a.custrecord_nxc_na_model, BUILTIN.DF(c.custevent_nxc_job_subtype);

-- today_cases (17/11/2026 16:07, 260 rows)
SELECT c.id, c.casenumber, c.createddate, c.lastmodifieddate, c.startdate, c.status, BUILTIN.DF(c.status) AS status_name, BUILTIN.DF(c.custevent_nx_case_type) AS case_type_name, BUILTIN.DF(c.custevent_nxc_job_subtype) AS job_subtype_name, BUILTIN.DF(c.custevent_ajg_deparmtnet_for_so) AS so_department_name, c.custevent_nx_case_asset, c.custevent_nx_case_transaction, c.custevent_created_from_quote, c.custevent_nxc_est_hours FROM supportcase c WHERE c.lastmodifieddate >= SYSDATE - 2 OR c.startdate >= SYSDATE - 2;

-- today_tasks (17/11/2026 16:07, 513 rows)
SELECT t.id, t.supportcase, t.transaction, t.status, t.createddate, t.lastmodifieddate, t.startdate, t.enddate, t.completeddate, t.assigned, BUILTIN.DF(t.custevent_nx_task_type) AS task_type_name, BUILTIN.DF(t.custevent_nxc_task_result) AS result_name, t.custevent_nx_start_date, t.custevent_nx_start_time, t.custevent_nx_end_date, t.custevent_nx_end_time, t.custevent_nx_task_start, t.custevent_nx_task_end, t.custevent_nxc_task_dailyestimatedhours, t.custevent_nx_task_booking_confirmed FROM task t WHERE t.lastmodifieddate >= SYSDATE - 2 OR t.startdate >= SYSDATE - 2;

-- e2e_links (17/11/2026 16:08, 42 rows)
SELECT l.previousdoc, l.nextdoc, l.linktype FROM nexttransactionlink l WHERE l.previousdoc IN (391076,391250,391093,391268,391242,391290,391074,391051,391257,391224,391047,391225) OR l.nextdoc IN (391076,391250,391093,391268,391242,391290,391074,391051,391257,391224,391047,391225);

-- e2e_cases (17/11/2026 16:08, 12 rows)
SELECT c.id, TO_CHAR(c.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(c.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, BUILTIN.DF(c.status) AS status_name, c.custevent_nx_case_transaction AS so_id, c.custevent_created_from_quote AS from_quote, CASE WHEN c.custevent_odometer_reading IS NULL THEN 0 ELSE 1 END AS has_odo FROM supportcase c WHERE c.id IN (1353929,1354240,1356482,1358517,1361258,1363295,1364110,1367475,1367476,1367887,1369924,1372866);

-- e2e_tasks (17/11/2026 16:08, 13 rows)
SELECT t.id, t.supportcase, t.transaction, t.status, BUILTIN.DF(t.custevent_nx_task_type) AS task_type_name, BUILTIN.DF(t.custevent_nxc_task_result) AS result_name, TO_CHAR(t.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(t.completeddate,'DD/MM/YYYY HH24:MI') AS completed_at, TO_CHAR(t.custevent_nx_task_start,'DD/MM/YYYY HH24:MI') AS nx_task_start, TO_CHAR(t.custevent_nx_task_end,'DD/MM/YYYY HH24:MI') AS nx_task_end, t.custevent_nx_start_time, t.custevent_nx_end_time, t.custevent_nxc_task_dailyestimatedhours AS est_hours, CASE WHEN t.custevent_nx_actions_taken IS NULL THEN 0 ELSE 1 END AS has_actions FROM task t WHERE t.supportcase IN (1353929,1354240,1356482,1358517,1361258,1363295,1364110,1367475,1367476,1367887,1369924,1372866);

-- e2e_timebills (17/11/2026 16:08, 16 rows)
SELECT b.id, b.custcol_nx_case, b.custcol_nx_task, b.hours, b.isbillable, TO_CHAR(b.createddate,'DD/MM/YYYY HH24:MI') AS created_at, b.custcol_nxc_start_time, b.custcol_nxc_finish_time, CASE WHEN b.custcol_nxc_start_check IS NULL THEN 0 ELSE 1 END AS has_start_check, CASE WHEN b.custcol_nxc_finish_check IS NULL THEN 0 ELSE 1 END AS has_finish_check FROM timebill b WHERE b.custcol_nx_case IN (1353929,1354240,1356482,1358517,1361258,1363295,1364110,1367475,1367476,1367887,1369924,1372866);

-- e2e_trans (17/11/2026 16:08, 38 rows)
SELECT t.id, t.type, BUILTIN.DF(t.status) AS status_name, TO_CHAR(t.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(t.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, t.trandate, BUILTIN.DF(t.employee) AS employee_name, t.source FROM transaction t WHERE t.id IN (352437,386557,389822,391047,391051,391052,391055,391056,391057,391074,391076,391093,391095,391097,391114,391115,391224,391225,391226,391241,391242,391243,391244,391247,391248,391250,391252,391253,391257,391264,391268,391270,391271,391275,391276,391286,391288,391290);

-- e2e_sysnotes (17/11/2026 16:08, 0 rows)
SELECT n.recordtypeid, n.recordid, TO_CHAR(n.date,'DD/MM/YYYY HH24:MI') AS at, BUILTIN.DF(n.context) AS context_name, n.type, n.field, BUILTIN.DF(n.role) AS role_name FROM systemnote n WHERE n.recordid IN (352437,386557,389822,391047,391051,391052,391055,391056,391057,391074,391076,391093,391095,391097,391114,391115,391224,391225,391226,391241,391242,391243,391244,391247,391248,391250,391252,391253,391257,391264,391268,391270,391271,391275,391276,391286,391288,391290) AND n.date >= SYSDATE - 30;

-- tr_asset (24/11/2026 15:53, 1 rows)
SELECT a.id, a.name, TO_CHAR(a.created,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(a.lastmodified,'DD/MM/YYYY HH24:MI') AS modified_at, BUILTIN.DF(a.owner) AS created_by, a.custrecord_nx_asset_customer AS customer_id, BUILTIN.DF(a.custrecord_nxc_na_created_from) AS created_from, TO_CHAR(a.custrecord_ajg_next_service_date,'DD/MM/YYYY') AS next_service, BUILTIN.DF(a.custrecord_nxc_na_fueltype) AS fuel FROM customrecord_nx_asset a WHERE UPPER(a.name) LIKE '%101TXC%';

-- tr_customer (24/11/2026 15:54, 1 rows)
SELECT c.id, c.entityid AS customer_no, TO_CHAR(c.datecreated,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(c.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, BUILTIN.DF(c.entitystatus) AS status, BUILTIN.DF(c.leadsource) AS source, BUILTIN.DF(c.salesrep) AS sales_rep, TO_CHAR(c.firstorderdate,'DD/MM/YYYY') AS first_order, TO_CHAR(c.firstsaledate,'DD/MM/YYYY') AS first_sale FROM customer c WHERE c.id = 922380;

-- tr_cases (24/11/2026 15:54, 3 rows)
SELECT c.id, c.casenumber, TO_CHAR(c.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(c.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, BUILTIN.DF(c.status) AS status_name, BUILTIN.DF(c.category) AS job_type, BUILTIN.DF(c.assigned) AS assigned, c.custevent_nx_case_transaction AS so_id, c.custevent_created_from_quote AS from_quote, c.custevent_odometer_reading AS odometer, TO_CHAR(c.startdate,'DD/MM/YYYY') AS start_date, TO_CHAR(c.enddate,'DD/MM/YYYY') AS end_date FROM supportcase c WHERE c.custevent_nx_case_asset = 37924;

-- tr_tasks (24/11/2026 15:54, 6 rows)
SELECT t.id, t.supportcase, t.status, BUILTIN.DF(t.assigned) AS assigned, BUILTIN.DF(t.owner) AS created_by, BUILTIN.DF(t.custevent_nx_task_type) AS task_type_name, BUILTIN.DF(t.custevent_nxc_task_result) AS result_name, TO_CHAR(t.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(t.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, TO_CHAR(t.completeddate,'DD/MM/YYYY HH24:MI') AS completed_at, TO_CHAR(t.startdate,'DD/MM/YYYY') AS start_date, t.custevent_nx_start_time, t.custevent_nx_end_time, t.custevent_nxc_task_dailyestimatedhours AS est_hours FROM task t WHERE t.supportcase IN (1368090,1368091,1376222);

-- tr_timebills (24/11/2026 15:54, 1 rows)
SELECT b.id, b.custcol_nx_case, b.custcol_nx_task, BUILTIN.DF(b.employee) AS employee_name, b.hours, b.isbillable, TO_CHAR(b.trandate,'DD/MM/YYYY') AS work_date, TO_CHAR(b.createddate,'DD/MM/YYYY HH24:MI') AS created_at, b.custcol_nxc_start_time, b.custcol_nxc_finish_time FROM timebill b WHERE b.custcol_nx_case IN (1368090,1368091,1376222);

-- tr_trans (24/11/2026 15:54, 1 rows)
SELECT t.id, t.type, t.tranid, BUILTIN.DF(t.status) AS status_name, TO_CHAR(t.trandate,'DD/MM/YYYY') AS tran_date, TO_CHAR(t.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(t.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, BUILTIN.DF(t.employee) AS employee_name, t.foreigntotal AS total, t.source FROM transaction t WHERE t.entity = 922380;

-- tr_links (24/11/2026 15:55, 9 rows)
SELECT l.previousdoc, l.nextdoc, l.linktype FROM nexttransactionlink l WHERE l.previousdoc IN (387969,389006,392194) OR l.nextdoc IN (387969,389006,392194);

-- tr_links2 (24/11/2026 15:55, 6 rows)
SELECT l.previousdoc, l.nextdoc, l.linktype FROM nexttransactionlink l WHERE l.previousdoc IN (392196,392198,392199) OR l.nextdoc IN (392196,392198,392199);

-- tr_docs (24/11/2026 15:55, 10 rows)
SELECT t.id, t.type, t.tranid, BUILTIN.DF(t.status) AS status_name, TO_CHAR(t.trandate,'DD/MM/YYYY') AS tran_date, TO_CHAR(t.createddate,'DD/MM/YYYY HH24:MI') AS created_at, TO_CHAR(t.lastmodifieddate,'DD/MM/YYYY HH24:MI') AS modified_at, BUILTIN.DF(t.employee) AS employee_name, t.entity, t.foreigntotal AS total FROM transaction t WHERE t.id IN (387969,389006,389008,389009,389010,389029,392194,392196,392198,392199,393110);

-- tr_paycheck (24/11/2026 15:55, 5 rows)
SELECT t.id, t.type, t.tranid, BUILTIN.DF(t.status) AS status_name, TO_CHAR(t.trandate,'DD/MM/YYYY') AS tran_date, TO_CHAR(t.createddate,'DD/MM/YYYY HH24:MI') AS created_at, t.entity, t.foreigntotal AS total FROM transaction t WHERE t.entity IN (922380,930878,924505) AND t.type NOT IN ('PurchOrd');

-- tr_unpaid (24/11/2026 15:55, 1 rows)
SELECT t.id, t.tranid, t.foreignamountunpaid AS unpaid, t.foreignamountpaid AS paid, TO_CHAR(t.duedate,'DD/MM/YYYY') AS due_date, BUILTIN.DF(t.terms) AS terms FROM transaction t WHERE t.id = 392199;

-- tr_projects (24/11/2026 15:55, 2 rows)
SELECT j.id, j.entityid AS project_no, TO_CHAR(j.datecreated,'DD/MM/YYYY HH24:MI') AS created_at, BUILTIN.DF(j.entitystatus) AS status, j.parent FROM job j WHERE j.id IN (930878,924505);

-- tr_inv_lines (24/11/2026 15:55, 16 rows)
SELECT tl.linesequencenumber AS seq, BUILTIN.DF(tl.item) AS item_name, tl.quantity, tl.foreignamount AS amount, tl.itemtype FROM transactionline tl WHERE tl.transaction = 392199 AND tl.mainline = 'F' AND tl.taxline = 'F' ORDER BY tl.linesequencenumber;

-- gap_asset (24/11/2026 16:20, 1 rows)
SELECT a.id, CASE WHEN UPPER(REPLACE(a.custrecord_nx_asset_serial,' ','')) = '101TXC' THEN 1 ELSE 0 END AS rego_in_serial, BUILTIN.DF(a.custrecord_nx_asset_type) AS asset_type, BUILTIN.DF(a.custrecord_nx_asset_region) AS region, BUILTIN.DF(a.custrecord_nxc_na_brandmake) AS make, BUILTIN.DF(a.custrecord_nxc_na_model) AS model FROM customrecord_nx_asset a WHERE a.id = 37924;

-- gap_asset2 (24/11/2026 16:20, 1 rows)
SELECT a.id, CASE WHEN UPPER(REPLACE(a.custrecord_nx_asset_serial,' ','')) = '101TXC' THEN 'yes' ELSE 'no' END AS flag_a FROM customrecord_nx_asset a WHERE a.id = 37924;

-- gap_case (24/11/2026 16:20, 1 rows)
SELECT c.id, BUILTIN.DF(c.category) AS category, BUILTIN.DF(c.custevent_nx_case_type) AS nx_case_type, BUILTIN.DF(c.custevent_ajg_deparmtnet_for_so) AS department, BUILTIN.DF(c.custevent_nxc_job_subtype) AS job_subtype, BUILTIN.DF(c.profile) AS profile, BUILTIN.DF(c.subsidiary) AS subsidiary, c.custevent_nxc_est_hours AS est_hours, c.custevent_sms_job_confirm AS sms, BUILTIN.DF(c.origin) AS origin FROM supportcase c WHERE c.id = 1376222;

-- item_types (24/11/2026 16:55, 8 rows)
SELECT i.itemtype, COUNT(*) AS n FROM item i WHERE i.isinactive = 'F' GROUP BY i.itemtype;

-- item_labour (24/11/2026 16:55, 29 rows)
SELECT i.id, i.itemid, i.displayname, i.itemtype, BUILTIN.DF(i.class) AS class_name, BUILTIN.DF(i.department) AS dept, i.isinactive FROM item i WHERE i.itemtype IN ('NonInvtPart','OthCharge','Service') AND (UPPER(i.itemid) LIKE 'LAB%' OR UPPER(i.itemid) LIKE 'WAT%' OR i.itemid IN ('TWR - TOXIC WASTE REMOVAL','WC WORKSHOP CONSUMABLES','FREIGHT','MISC'));

-- item_group_members (24/11/2026 16:55, 8 rows)
SELECT BUILTIN.DF(m.parentitem) AS group_name, BUILTIN.DF(m.item) AS member, m.quantity, m.linenumber FROM itemmember m WHERE m.parentitem IN (SELECT id FROM item WHERE itemtype = 'Group' AND (UPPER(itemid) LIKE '4WD VEHICLE SERVICE (DIESEL)%' OR UPPER(displayname) LIKE '4WD VEHICLE SERVICE (DIESEL)%')) ORDER BY m.linenumber;

-- item_part_probe3 (24/11/2026 16:55, 8 rows)
SELECT i.id, i.itemid, i.displayname, i.itemtype, BUILTIN.DF(i.class) AS class_name FROM item i WHERE i.itemid IN ('PSA561','PCF631A','KE75-N1C8','Z929','6577WOR','DBA2716E','MOTOR OIL','OIL FILTER');

-- item_class_counts (24/11/2026 16:55, 90 rows)
SELECT BUILTIN.DF(i.class) AS class_name, COUNT(*) AS n FROM item i WHERE i.isinactive = 'F' AND i.itemtype = 'InvtPart' GROUP BY BUILTIN.DF(i.class) ORDER BY 2 DESC;

