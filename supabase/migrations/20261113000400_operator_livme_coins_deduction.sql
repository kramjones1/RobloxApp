-- Operator-only manual LivMe Coins deductions.
-- Promotional balance is consumed first, then purchased balance.
-- All deductions are atomic, audited, and idempotent.

create or replace function public.admin_deduct_livme_coins(
  p_target_user_id uuid,
  p_amount integer,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_wallet public.coin_wallets%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_promotional_deduct integer;
  v_purchased_deduct integer;
  v_new_balance integer;
  v_key text;
  v_source text;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_target_user_id is null then raise exception 'TARGET_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'AMOUNT_OUT_OF_RANGE';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 240 then
    raise exception 'REASON_REQUIRED';
  end if;

  v_key := 'operator_manual_deduct:' || p_request_id::text;

  select * into v_wallet
  from public.coin_wallets
  where user_id = p_target_user_id
  for update;

  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  -- Check idempotency while holding the wallet lock.
  if exists (
    select 1 from public.coin_transactions
    where idempotency_key = v_key
  ) then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'balance', v_wallet.total_balance
    );
  end if;

  if v_wallet.total_balance < p_amount then
    raise exception 'INSUFFICIENT_WALLET_BALANCE';
  end if;

  v_promotional_deduct := least(v_wallet.promotional_balance, p_amount);
  v_purchased_deduct := p_amount - v_promotional_deduct;
  v_new_balance := v_wallet.total_balance - p_amount;
  v_source := case
    when v_promotional_deduct > 0 and v_purchased_deduct > 0 then 'mixed'
    when v_promotional_deduct > 0 then 'promotional'
    else 'purchased'
  end;

  update public.coin_wallets
  set promotional_balance = promotional_balance - v_promotional_deduct,
      purchased_balance = purchased_balance - v_purchased_deduct,
      updated_at = now()
  where user_id = p_target_user_id;

  insert into public.coin_transactions(
    user_id, transaction_type, coin_source, amount,
    balance_after, idempotency_key, metadata
  ) values (
    p_target_user_id, 'adjustment', v_source, p_amount,
    v_new_balance, v_key,
    jsonb_build_object(
      'reason', v_reason,
      'admin_id', v_admin_id,
      'adjustment_type', 'operator_manual_deduct',
      'promotional_deducted', v_promotional_deduct,
      'purchased_deducted', v_purchased_deduct
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'balance', v_new_balance,
    'deducted', p_amount,
    'promotional_deducted', v_promotional_deduct,
    'purchased_deducted', v_purchased_deduct
  );
end;
$function$;

revoke all on function public.admin_deduct_livme_coins(uuid, integer, text, uuid) from public, anon;
grant execute on function public.admin_deduct_livme_coins(uuid, integer, text, uuid) to authenticated;
