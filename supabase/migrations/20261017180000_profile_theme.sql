-- Student colour themes: each student may pick one of four looks for the study area (src/lib/theme/themes.ts).
-- NULL = never chosen = the default ("royal"). Staff pages always render the default theme, whatever is stored here.
--
-- Writes: the student's own user token through the existing "profiles: update own or admin any" policy and the
-- table-level UPDATE grant that 20261017120000_revoke_unneeded_grants keeps for authenticated (profiles has no column
-- grants). The privileged-columns trigger only guards role / subscription_tier, so this column needs nothing new.
-- Additive and nullable: old app code ignores it. ROLLBACK: ALTER TABLE public.profiles DROP COLUMN theme;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme text
  CONSTRAINT profiles_theme_check CHECK (theme IS NULL OR theme IN ('royal', 'lagoon', 'midnight', 'sunset'));

COMMENT ON COLUMN public.profiles.theme IS
  'Study-area colour theme chosen by the student: royal | lagoon | midnight | sunset. NULL = default (royal).';
