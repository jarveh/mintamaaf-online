-- The creation form no longer collects recipient/sender/tone/language; tone was
-- NOT NULL, so relax it. Attachments: one optional reference image per page,
-- stored in the private `pages` bucket and uploaded to Stitch as design input.
alter table pages alter column tone drop not null;
alter table pages add column if not exists attachment_path text;
alter table pages add column if not exists attachment_mime text;
