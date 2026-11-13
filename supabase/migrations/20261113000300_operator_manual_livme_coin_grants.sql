-- Operator-only manual LivMe Coin grants. Credits promotional balance only.
create or replace function public.admin_get_coin_wallet(p_target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_wallet public.coin_wallets%rowtype; v_transactions jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_target_user_id is null then raise exception 'TARGET_REQUIRED'; end if;
  insert into public.coin_wallets(user_id) values (p_target_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from public.coin_wallets where user_id = p_target_user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'transaction_type', t.transaction_type, 'coin_source', t.coin_source,
    'amount', t.amount, 'balance_after', t.balance_after, 'metadata', t.metadata, 'created_at', t.created_at
  ) order by t.created_at desc), '[]'::jsonb) into v_transactions
  from (select * from public.coin_transactions where user_id = p_target_user_id order by created_at desc limit 10) t;
  return jsonb_build_object('user_id', v_wallet.user_id, 'total_balance', v_wallet.total_balance,
    'purchased_balance', v_wallet.purchased_balance, 'promotional_balance', v_wallet.promotional_balance,
    'transactions', v_transactions);
end;
$$;

create or replace function public.admin_add_livme_coins(
  p_target_user_id uuid, p_amount integer, p_reason text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_wallet public.coin_wallets%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_new_balance integer;
  v_key text;
begin
  if v_admin_id is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_target_user_id is null then raise exception 'TARGET_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then raise exception 'AMOUNT_OUT_OF_RANGE'; end if;
  if length(v_reason) < 3 or length(v_reason) > 240 then raise exception 'REASON_REQUIRED'; end if;
  if not exists (select 1 from auth.users where id = p_target_user_id) then raise exception 'TARGET_USER_NOT_FOUND'; end if;

  v_key := 'operator_manual_grant:' || p_request_id::text;
  insert into public.coin_wallets(user_id) values (p_target_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from public.coin_wallets where user_id = p_target_user_id for update;

  if exists (select 1 from public.coin_transactions where idempotency_key = v_key) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', v_wallet.total_balance);
  end if;

  v_new_balance := v_wallet.total_balance + p_amount;
  update public.coin_wallets set promotional_balance = promotional_balance + p_amount, updated_at = now()
  where user_id = p_target_user_id;
  insert into public.coin_transactions(user_id, transaction_type, coin_source, amount, balance_after, idempotency_key, metadata)
  values (p_target_user_id, 'adjustment', 'promotional', p_amount, v_new_balance, v_key,
    jsonb_build_object('reason', v_reason, 'admin_id', v_admin_id, 'adjustment_type', 'operator_manual_add'));
  return jsonb_build_object('ok', true, 'duplicate', false, 'balance', v_new_balance, 'added', p_amount);
end;
$$;

revoke all on function public.admin_get_coin_wallet(uuid) from public, anon;
revoke all on function public.admin_add_livme_coins(uuid, integer, text, uuid) from public, anon;
grant execute on function public.admin_get_coin_wallet(uuid) to authenticated;
grant execute on function public.admin_add_livme_coins(uuid, integer, text, uuid) to authenticated;
