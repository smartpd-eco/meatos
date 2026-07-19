-- Impact: enable UUID generation, citext, and trigram search for MEATOS database objects.
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

