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

