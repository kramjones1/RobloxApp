-- LivMe Coins Phase 1 foundation: wallet, immutable ledger, and one-time launch/signup bonuses.
-- This migration is staged only. Do not apply to the shared production Supabase project
-- until the migration has been reviewed and production rollout is explicitly approved.

create table if not exists public.coin_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  purchased_balance integer not null default 0 check (purchased_balance >= 0),
  promotional_balance integer not null default 0 check (promotional_balance >= 0),
  total_balance integer generated always as (purchased_balance + promotional_balance) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_type text not null check (
    transaction_type in ('launch_bonus', 'signup_bonus', 'purchase', 'message_spend', 'refund', 'adjustment')
  ),
  coin_source text not null check (coin_source in ('purchased', 'promotional', 'mixed', 'system')),
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions (user_id, created_at desc);

alter table public.coin_wallets enable row level security;
alter table public.coin_transactions enable row level security;

drop policy if exists "Users can view their own coin wallet" on public.coin_wallets;
create policy "Users can view their own coin wallet"
  on public.coin_wallets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own coin transactions" on public.coin_transactions;
create policy "Users can view their own coin transactions"
  on public.coin_transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.coin_wallets from public, anon, authenticated;
revoke all on public.coin_transactions from public, anon, authenticated;
grant select on public.coin_wallets to authenticated;
grant select on public.coin_transactions to authenticated;

-- Internal helper. The wallet row lock serializes concurrent grants for the same account.
-- The unique idempotency key prevents a retry from crediting the same bonus twice.
create or replace function private.grant_livme_coin_bonus(
  p_user_id uuid,
  p_transaction_type text,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_total_balance integer;
  v_transaction_id uuid;
begin
  if p_transaction_type not in ('launch_bonus', 'signup_bonus') then
    raise exception 'Invalid bonus transaction type';
  end if;

  insert into public.coin_wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select promotional_balance, total_balance
    into v_balance, v_total_balance
    from public.coin_wallets
    where user_id = p_user_id
    for update;

  insert into public.coin_transactions (
    user_id,
    transaction_type,
    coin_source,
    amount,
    balance_after,
    idempotency_key,
    metadata
  )
  values (
    p_user_id,
    p_transaction_type,
    'promotional',
    100,
    v_total_balance + 100,
    p_idempotency_key,
    jsonb_build_object('reason', case
      when p_transaction_type = 'launch_bonus' then 'one-time existing-user launch grant'
      else 'one-time new-user signup grant'
    end)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is not null then
    update public.coin_wallets
      set promotional_balance = promotional_balance + 100,
          updated_at = now()
      where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function private.grant_livme_coin_bonus(uuid, text, text) from public, anon, authenticated;

-- Grant existing accounts their launch bonus once. Includes unconfirmed accounts;
-- the unique key makes this safe to re-run without duplicate credits.
do $$
declare
  v_user record;
begin
  for v_user in
    select id from auth.users
  loop
    perform private.grant_livme_coin_bonus(
      v_user.id,
      'launch_bonus',
      'launch_bonus:' || v_user.id::text
    );
  end loop;
end;
$$;

-- Future accounts receive the same 100 LC as a signup bonus.
create or replace function private.handle_livme_coin_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.grant_livme_coin_bonus(
    new.id,
    'signup_bonus',
    'signup_bonus:' || new.id::text
  );
  return new;
end;
$$;

revoke all on function private.handle_livme_coin_signup() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_livme_coin_bonus on auth.users;
create trigger on_auth_user_created_livme_coin_bonus
  after insert on auth.users
  for each row
  execute function private.handle_livme_coin_signup();
