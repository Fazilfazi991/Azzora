-- FICTIONAL SECURITY FIXTURE ONLY. Adds a separate company; it does not alter
-- authentication, grants, policies, Company A, or any real/production data.
-- OFFLINE TEST ONLY. Never apply this record fixture to hosted staging: the
-- missing canonical metadata would interfere with Company B owner bootstrap.
begin;
do $$ begin
  if not exists (select 1 from azzora.environment_config
    where project_ref='hkhomrrvxtcxnxvdlkoh' and environment='synthetic-staging'
      and not real_financial_posting_enabled and not real_document_processing_enabled)
  then raise exception 'Expected isolated fictional staging configuration'; end if;
  if exists (select 1 from azzora.companies where id='4b44d384-fbbd-44f3-91fc-abd3ff89a19f')
  then raise exception 'Security fixture already exists; inspect it rather than overwriting'; end if;
end $$;
insert into azzora.companies(id,name,data_mode)
  values('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','FICTIONAL SECURITY COMPANY B','fictional-staging');
insert into azzora.parties(company_id,id,kind,payload) values
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','SECURITY-B-CUSTOMER','customer','{"name":"FICTIONAL-SECURITY-B-CUSTOMER"}'),
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','SECURITY-B-SUPPLIER','supplier','{"name":"FICTIONAL-SECURITY-B-SUPPLIER"}');
insert into azzora.projects(company_id,id,customer_id,payload) values
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','SECURITY-B-PROJECT','SECURITY-B-CUSTOMER','{"name":"FICTIONAL-SECURITY-B-PROJECT"}');
insert into azzora.accounts(company_id,id,code,name,type,postable,active) values
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','SECURITY-B-ACCOUNT','B-SEC-001','FICTIONAL-SECURITY-B-ACCOUNT','Asset',false,false);
insert into azzora.records(company_id,entity_type,id,project_id,party_id,payload,status) values
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','sales_invoice','SECURITY-B-INVOICE','SECURITY-B-PROJECT','SECURITY-B-CUSTOMER','{"marker":"FICTIONAL-SECURITY-B-INVOICE"}','draft'),
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','receipt','SECURITY-B-RECEIPT','SECURITY-B-PROJECT','SECURITY-B-CUSTOMER','{"marker":"FICTIONAL-SECURITY-B-RECEIPT"}','draft'),
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','document','SECURITY-B-DOCUMENT','SECURITY-B-PROJECT',null,'{"marker":"FICTIONAL-SECURITY-B-DOCUMENT"}','draft');
-- Metadata only: no Storage object bytes are created by this fixture.
insert into azzora.attachments(company_id,id,entity_type,entity_id,object_key,mime,bytes,sha256,scan_status) values
  ('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','SECURITY-B-FILE','document','SECURITY-B-DOCUMENT',
   '4b44d384-fbbd-44f3-91fc-abd3ff89a19f/SECURITY-B-FILE.pdf','application/pdf',1,repeat('0',64),'quarantine');
commit;
