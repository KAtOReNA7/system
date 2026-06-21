-- NON-PRODUCTION PROTOTYPE — NOT A FORMAL MIGRATION
\set ON_ERROR_STOP on
SET ROLE migration_owner;
SET search_path = m1, pg_catalog;

CREATE VIEW v_current_income WITH (security_barrier=true) AS
SELECT f.id AS income_fact_id,f.import_batch_id,f.import_file_id,f.source_sheet_name,f.source_row_number,
       f.bill_month,f.raw_channel_id,f.raw_channel_name,f.raw_authorization_category,f.raw_work_id,f.raw_work_name,
       f.actual_sales_amount,p.channel_id,p.standard_work_id,p.business_form,p.mapping_version_id
FROM m1.mapping_version mv
JOIN m1.income_projection p ON p.mapping_version_id=mv.id
JOIN m1.income_fact f ON f.id=p.income_fact_id
JOIN m1.import_batch b ON b.id=f.import_batch_id
WHERE mv.status='active' AND b.status='active';

CREATE VIEW v_basic_info_gap WITH (security_barrier=true) AS
SELECT sw.standard_work_id,
       biv.id AS active_basic_info_version_id,
       (biw.standard_work_id IS NULL) AS missing_basic_info_record,
       (biw.standard_work_name IS NULL OR biw.author_id IS NULL OR biw.copyright_start_date IS NULL OR biw.copyright_end_date IS NULL) AS missing_core_fields,
       (wca.standard_work_id IS NULL) AS missing_classification
FROM m1.standard_work sw
LEFT JOIN m1.basic_info_version biv ON biv.status='active'
LEFT JOIN m1.basic_info_version_work biw ON biw.basic_info_version_id=biv.id AND biw.standard_work_id=sw.standard_work_id
LEFT JOIN m1.work_classification_assignment wca ON wca.basic_info_version_id=biv.id AND wca.standard_work_id=sw.standard_work_id;

CREATE VIEW v_basic_info_m2_completeness WITH (security_barrier=true) AS
SELECT sw.standard_work_id,biv.id AS active_basic_info_version_id,
       biw.standard_work_name,biw.author_id,biw.copyright_start_date,biw.copyright_end_date,
       (wca.standard_work_id IS NOT NULL) AS has_level3_classification,
       COALESCE(tags.tag_count,0) AS assigned_tag_count,
       true AS pending_required_tag_configuration,
       (biw.standard_work_name IS NOT NULL AND biw.author_id IS NOT NULL
        AND biw.copyright_start_date IS NOT NULL AND biw.copyright_end_date IS NOT NULL
        AND wca.standard_work_id IS NOT NULL) AS core_fields_complete
FROM m1.standard_work sw
LEFT JOIN m1.basic_info_version biv ON biv.status='active'
LEFT JOIN m1.basic_info_version_work biw ON biw.basic_info_version_id=biv.id AND biw.standard_work_id=sw.standard_work_id
LEFT JOIN m1.work_classification_assignment wca ON wca.basic_info_version_id=biv.id AND wca.standard_work_id=sw.standard_work_id
LEFT JOIN LATERAL (
  SELECT count(*) AS tag_count FROM m1.work_tag_assignment wta
  WHERE wta.basic_info_version_id=biv.id AND wta.standard_work_id=sw.standard_work_id
) tags ON true;

CREATE VIEW v_bill_cutoff_months WITH (security_barrier=true) AS
SELECT (SELECT max(f.bill_month) FROM m1.income_fact f JOIN m1.import_batch b ON b.id=f.import_batch_id WHERE b.status='active') AS bill_max_month,
       (SELECT max(c.bill_month) FROM m1.month_completeness_confirmation c
         WHERE c.superseded_by_id IS NULL AND c.completeness_status='complete') AS latest_confirmed_complete_month;

CREATE VIEW v_income_projection_monthly WITH (security_barrier=true) AS
SELECT p.mapping_version_id,f.bill_month,p.channel_id,p.standard_work_id,p.business_form,
       count(*) AS fact_count,sum(f.actual_sales_amount) AS actual_sales_amount
FROM m1.income_projection p JOIN m1.income_fact f ON f.id=p.income_fact_id
GROUP BY p.mapping_version_id,f.bill_month,p.channel_id,p.standard_work_id,p.business_form;

RESET ROLE;
