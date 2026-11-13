-- LivMe Coins messaging RPC. Messaging charge flag defaults OFF during rollout.
-- The legacy INSERT policy remains temporarily so the currently deployed production
-- client is not broken before the RPC-enabled frontend is deployed.
create table if not exists public.coin_settings (
  singleton boolean primary key default true check (singleton),
  messaging_charge_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.coin_settings (singleton, messaging_charge_enabled)
values (true, false)
on conflict (singleton) do nothing;
alter table public.coin_settings enable row level security;
revoke all on public.coin_settings from public, anon, authenticated;

-- Preserve a caller-supplied message UUID so retries can be recognized by the RPC.
create or replace function public.guard_chat_message_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := coalesce(new.id, gen_random_uuid());
  new.created_at := now();
  new.read := false;
  new.content := btrim(new.content);
  return new;
end;
$$;

create or replace function public.send_chat_message(
  p_message_id uuid,
  p_receiver_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_existing public.chat_messages%rowtype;
  v_wallet public.coin_wallets%rowtype;
  v_charge_enabled boolean := false;
  v_source text;
  v_balance_after integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_message_id is null then
    raise exception 'MESSAGE_ID_REQUIRED';
  end if;
  if p_receiver_id is null or p_receiver_id = v_user_id then
    raise exception 'INVALID_RECIPIENT';
  end if;
  if length(v_content) < 1 or length(v_content) > 2000 then
    raise exception 'MESSAGE_LENGTH_INVALID';
  end if;
  if public.is_user_banned_simple(v_user_id) then
    raise exception 'ACCOUNT_SUSPENDED';
  end if;
  if not exists (select 1 from auth.users where id = p_receiver_id) then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  insert into public.coin_wallets (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_wallet
    from public.coin_wallets
    where user_id = v_user_id
    for update;

  -- The wallet lock serializes concurrent retries using the same message UUID.
  select * into v_existing
    from public.chat_messages
    where id = p_message_id;

  if found then
    if v_existing.sender_id <> v_user_id
       or v_existing.receiver_id <> p_receiver_id
       or v_existing.content <> v_content then
      raise exception 'MESSAGE_ID_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok', true,
      'message_id', p_message_id,
      'balance', v_wallet.total_balance,
      'charged', exists (
        select 1 from public.coin_transactions
        where idempotency_key = 'message_spend:' || p_message_id::text
      ),
      'duplicate', true
    );
  end if;

  select messaging_charge_enabled into v_charge_enabled
    from public.coin_settings where singleton = true;

  if coalesce(v_charge_enabled, false) then
    if v_wallet.total_balance < 1 then
      return jsonb_build_object(
        'ok', false,
        'code', 'INSUFFICIENT_LC',
        'balance', v_wallet.total_balance
      );
    end if;

    if v_wallet.promotional_balance > 0 then
      update public.coin_wallets
        set promotional_balance = promotional_balance - 1,
            updated_at = now()
        where user_id = v_user_id;
      v_source := 'promotional';
    else
      update public.coin_wallets
        set purchased_balance = purchased_balance - 1,
            updated_at = now()
        where user_id = v_user_id;
      v_source := 'purchased';
    end if;
    v_balance_after := v_wallet.total_balance - 1;
  else
    v_source := null;
    v_balance_after := v_wallet.total_balance;
  end if;

  insert into public.chat_messages (id, sender_id, receiver_id, content)
  values (p_message_id, v_user_id, p_receiver_id, v_content);

  if coalesce(v_charge_enabled, false) then
    insert into public.coin_transactions (
      user_id, transaction_type, coin_source, amount, balance_after,
      idempotency_key, metadata
    ) values (
      v_user_id, 'message_spend', v_source, 1, v_balance_after,
      'message_spend:' || p_message_id::text,
      jsonb_build_object('message_id', p_message_id, 'receiver_id', p_receiver_id)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message_id', p_message_id,
    'balance', v_balance_after,
    'charged', coalesce(v_charge_enabled, false),
    'duplicate', false
  );
end;
$$;

create or replace function public.log_chat_call_message(
  p_receiver_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_content text := btrim(coalesce(p_content, ''));
  v_message_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_receiver_id is null or p_receiver_id = v_user_id then raise exception 'INVALID_RECIPIENT'; end if;
  if public.is_user_banned_simple(v_user_id) then raise exception 'ACCOUNT_SUSPENDED'; end if;
  if v_content !~ '^\[livme-call\]\|(audio|video)\|[0-9]+\|completed$' then
    raise exception 'INVALID_CALL_LOG';
  end if;
  if length(v_content) > 2000 then raise exception 'MESSAGE_LENGTH_INVALID'; end if;
  if not exists (select 1 from auth.users where id = p_receiver_id) then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  insert into public.chat_messages (id, sender_id, receiver_id, content)
  values (v_message_id, v_user_id, p_receiver_id, v_content);

  return jsonb_build_object('ok', true, 'message_id', v_message_id, 'charged', false);
end;
$$;

revoke all on function public.send_chat_message(uuid, uuid, text) from public, anon;
revoke all on function public.log_chat_call_message(uuid, text) from public, anon;
grant execute on function public.send_chat_message(uuid, uuid, text) to authenticated;
grant execute on function public.log_chat_call_message(uuid, text) to authenticated;
