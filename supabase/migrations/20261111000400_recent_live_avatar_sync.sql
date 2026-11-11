-- Keep Recent Live profile-photo snapshots in sync with the current profile avatar.
-- The trigger is SECURITY DEFINER so a user's profile update can refresh the
-- corresponding chatheads in other users' Recent Live rows without granting
-- clients cross-user UPDATE access to recent_live.

create or replace function public.sync_recent_live_avatar()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.recent_live
       set partner_avatar = coalesce(new.avatar_url, '')
     where partner_id = new.user_id
       and partner_avatar is distinct from coalesce(new.avatar_url, '');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_recent_live_avatar() from public, anon, authenticated;

drop trigger if exists chat_profiles_sync_recent_live_avatar on public.chat_profiles;
create trigger chat_profiles_sync_recent_live_avatar
after update of avatar_url on public.chat_profiles
for each row
execute function public.sync_recent_live_avatar();
