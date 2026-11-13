-- Enforce the LivMe Coins Phase 1 message charge on every user-originated chat message.
-- All production frontend send paths use send_chat_message; call-completion logs use
-- log_chat_call_message and remain exempt. Removing the legacy INSERT policy closes
-- the direct PostgREST bypass before enabling the charge switch.

drop policy if exists "msg insert" on public.chat_messages;

do $$
begin
  if not exists (select 1 from public.coin_settings where singleton = true) then
    raise exception 'LIVME_COINS_SETTINGS_MISSING';
  end if;
end;
$$;

update public.coin_settings
set messaging_charge_enabled = true,
    updated_at = now()
where singleton = true;
