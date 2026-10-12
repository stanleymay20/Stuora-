-- Commit the enum extension separately before using it in routines.
alter type public.listing_kind add value if not exists 'post';
