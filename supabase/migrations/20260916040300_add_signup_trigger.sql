-- T18: Auto-create a profiles row (role='student', tier='free') on signup.
--
-- SECURITY DEFINER: runs as postgres, so it can INSERT into public.profiles
-- regardless of RLS (profiles deliberately has no INSERT policy).
-- EXCEPTION block: a failure here must never block signup itself — log a
-- WARNING to the Postgres log stream and let the auth.users insert succeed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, subscription_tier, full_name)
  VALUES (
    NEW.id,
    'student',
    'free',
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
