-- Exercise migration 20261027120000: the order VAT rule and the line net rule accept BOTH the
-- pre-27-October rule (VAT from the net) and the whole-riyal rule (a gross per meter rounded to a
-- whole riyal, VAT extracted from the order total), and nothing else.
--
-- SAFE ON THE LIVE DATABASE: the live constraint definitions are copied onto TEMPORARY tables and
-- only those are written; no order, item, sequence or income row is touched. ONE transaction,
-- ROLLED BACK. Run after the migration, in the Supabase SQL editor.
-- Success = the last result row reads: PASS fabric_store whole-riyal meter price (…)

begin;

do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = 'public.fabric_store_order_items'::regclass and c.conname = 'fabric_store_order_items_net_rule';
  execute format(
    'create temp table t_items (purchase_mode text, quantity_pieces smallint, quantity_cm integer,
       stock_consumption_cm integer, price_per_meter_halalas bigint, discount_basis_points integer,
       unit_price_halalas bigint, net_halalas bigint, vat_halalas bigint, gross_halalas bigint,
       constraint net_rule %s)', v_def);

  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = 'public.fabric_store_orders'::regclass and c.conname = 'fabric_store_orders_vat_rule';
  execute format(
    'create temp table t_orders (items_net_halalas bigint, shipping_net_halalas bigint, vat_halalas bigint,
       total_halalas bigint, vat_basis_points integer, constraint vat_rule %s)', v_def);
end $$;

create function pg_temp.item_ok(p_case text, p_mode text, p_cm integer, p_price bigint, p_discount integer,
  p_unit bigint, p_net bigint, p_vat bigint, p_expect boolean)
returns void language plpgsql as $$
declare
  v_ok boolean := true;
begin
  begin
    insert into t_items values (p_mode, case when p_mode = 'piece' then 1 end,
      case when p_mode = 'meter' then p_cm end, p_cm, p_price, p_discount, p_unit, p_net, p_vat, p_net + p_vat);
  exception when check_violation then
    v_ok := false;
  end;
  if v_ok is distinct from p_expect then
    raise exception 'TEST FAILED: line %: expected accepted=% but got %', p_case, p_expect, v_ok;
  end if;
end;
$$;

create function pg_temp.order_ok(p_case text, p_items_net bigint, p_shipping_net bigint, p_vat bigint, p_expect boolean)
returns void language plpgsql as $$
declare
  v_ok boolean := true;
begin
  begin
    insert into t_orders values (p_items_net, p_shipping_net, p_vat, p_items_net + p_shipping_net + p_vat, 1500);
  exception when check_violation then
    v_ok := false;
  end;
  if v_ok is distinct from p_expect then
    raise exception 'TEST FAILED: order %: expected accepted=% but got %', p_case, p_expect, v_ok;
  end if;
end;
$$;

do $$
begin
  -- السطر: 250 للمتر ⇒ 287.50 ⇒ 288 شامل.
  perform pg_temp.item_ok('1 m at 288 (whole riyal)', 'meter', 100, 25000, 0, 25000, 25043, 3757, true);
  perform pg_temp.item_ok('3.5 m at 288 = 1008', 'meter', 350, 25000, 0, 25000, 87652, 13148, true);
  perform pg_temp.item_ok('piece 3.5 m = 1008', 'piece', 350, 25000, 0, 87500, 87652, 13148, true);
  perform pg_temp.item_ok('15% off 250 => 212.50 => 244.375 => 244', 'meter', 100, 25000, 1500, 21250, 21217, 3183, true);
  perform pg_temp.item_ok('249.78 => 287.247 rounds down to 287', 'meter', 200, 24978, 0, 24978, 49913, 7487, true);
  perform pg_temp.item_ok('old rule still accepted', 'meter', 150, 25000, 0, 25000, 37500, 5625, true);
  perform pg_temp.item_ok('old piece rule still accepted', 'piece', 350, 25000, 0, 87500, 87500, 13125, true);
  perform pg_temp.item_ok('gross 287.50 with a net that is not the old rule', 'meter', 100, 25000, 0, 25000, 25001, 3749, false);
  perform pg_temp.item_ok('289 for a 288 meter', 'meter', 100, 25000, 0, 25000, 25130, 3770, false);
  perform pg_temp.item_ok('whole riyal but negative net', 'meter', 100, 25000, 0, 25000, -1, 28801, false);
  perform pg_temp.item_ok('price rounding to 0 riyal', 'meter', 100, 43, 0, 43, 0, 0, false);

  -- الطلب: 288 + شحن 50 = 338 ⇒ ضريبة round(338 × 15/115 = 44.087) = 44.09.
  perform pg_temp.order_ok('288 pickup, VAT from total', 25043, 0, 3757, true);
  perform pg_temp.order_ok('288 + shipping 50', 25043, 4348, 4409, true);
  perform pg_temp.order_ok('old rule still accepted', 25000, 0, 3750, true);
  perform pg_temp.order_ok('VAT one halala short of both rules', 25044, 0, 3756, false);
  perform pg_temp.order_ok('VAT one halala over both rules', 25042, 0, 3758, false);
end $$;

select 'PASS fabric_store whole-riyal meter price (both VAT rules accepted on orders and lines; 287.50, off-by-one and zero-riyal prices refused)' as result;

rollback;
