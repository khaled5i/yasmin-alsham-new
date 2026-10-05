-- Supabase-like replica of the parts of production that stage 2/3 touch.
-- Roles, privileges and defaults as read from the live project (22 Sep 2026).

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema private;
-- live: anon and authenticated have USAGE on private; service_role does NOT.
grant usage on schema private to anon, authenticated;

create table public.users (
  id uuid primary key, email text, full_name text, role text not null,
  is_active boolean not null default true, created_at timestamptz default now()
);
create table public.workers (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id), worker_type text
);

-- live definition (verbatim)
create or replace function private.can_manage_fabric_operations()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1
    from public.users u
    left join public.workers w on w.user_id = u.id
    where u.id = auth.uid()
      and u.is_active = true
      and (
        u.role = 'admin'
        or (u.role = 'worker' and w.worker_type in (
          'accountant', 'general_manager', 'fabric_store_manager'
        ))
      )
  );
$$;
revoke all on function private.can_manage_fabric_operations() from public, anon;
grant execute on function private.can_manage_fabric_operations() to authenticated;

create table public.fabric_inventory (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  fabric_type varchar,
  unit varchar not null default 'meter',
  current_quantity numeric(12, 2) not null default 0,
  sale_price_per_unit numeric(12, 2),
  images text[] not null default '{}',
  base_fabric_code varchar(32),
  has_color_variants boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table public.fabric_inventory_colors (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.fabric_inventory(id) on delete cascade,
  color_name varchar not null,
  current_quantity numeric(12, 2) not null default 0,
  fabric_code varchar(32),
  created_at timestamptz default now()
);
-- بطاقة القماش في واجهة المتجر. في الإنتاج تُنشأ وتُحدَّث بدوال المزامنة الكبيرة
-- (هجرة 20260722102813)؛ هنا جدول بأعمدته المستعملة + مزامنة مبسّطة في replica-wiring.
create table public.fabrics (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid references public.fabric_inventory(id) on delete cascade,
  inventory_color_id uuid references public.fabric_inventory_colors(id) on delete cascade,
  fabric_code varchar(32),
  name text,
  category text,
  image_url text,
  images text[],
  thumbnail_image text,
  available_colors text[],
  price_per_meter numeric,
  is_on_sale boolean default false,
  discount_percentage integer default 0,
  stock_quantity numeric default 0,
  min_order_meters numeric default 1,
  is_available boolean default true,
  is_active boolean default true,
  is_manually_hidden boolean not null default false,
  deleted_at timestamptz
);

-- columns as on production (read 29 Sep 2026; stage 6 writes the sale row itself)
create table public.income (
  id uuid primary key default gen_random_uuid(),
  branch varchar not null,
  order_id uuid,
  customer_name varchar,
  description text,
  amount numeric not null default 0,
  date date not null default current_date,
  is_automatic boolean default false,
  notes text,
  created_at timestamptz default now(),
  created_by uuid,
  quantity_meters numeric,
  category varchar,
  payment_method varchar,
  customer_source varchar,
  fabric_images text[] default '{}'::text[],
  buyer_name text,
  buyer_phone text,
  invoice_number bigint,
  alostaz_customer_id integer,
  alostaz_invoice_id integer,
  alostaz_invoice_code text,
  alostaz_sync_status text,
  alostaz_synced_at timestamptz,
  alostaz_sync_token uuid,
  alostaz_sync_error text,
  fabric_items jsonb,
  fabric_inventory_tracked boolean not null default false,
  cash_amount numeric,
  network_amount numeric,
  coupon_id uuid,
  coupon_code text,
  discount_percent numeric,
  discount_amount numeric,
  subtotal_amount numeric,
  constraint income_alostaz_sync_status_valid check (alostaz_sync_status is null
    or alostaz_sync_status = any (array['sending', 'sent', 'failed', 'review_required'])),
  constraint income_branch_check check (branch in ('tailoring', 'fabrics', 'ready_designs')),
  constraint income_payment_method_check check (payment_method is null or payment_method in ('cash', 'network', 'mixed')),
  constraint income_split_amounts_check check ((cash_amount is null or cash_amount >= 0)
    and (network_amount is null or network_amount >= 0)
    and (payment_method is distinct from 'mixed' or (cash_amount is not null and network_amount is not null)))
);
create sequence public.fabrics_invoice_number_seq;

-- columns and checks as on production (read 1 Oct 2026, fix batch A / AUD-01).
-- Not replicated: created_by → auth.users (no auth.users here).
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch varchar not null,
  type varchar not null,
  category varchar not null,
  description text,
  amount numeric not null default 0,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now(),
  created_by uuid,
  updated_at timestamptz default now(),
  supplier_id uuid,
  supplier_name text,
  recurrence_type varchar not null default 'one_time',
  recurring_day_of_month smallint,
  recurring_source_id uuid references public.expenses(id) on delete cascade,
  recurring_month date,
  is_auto_generated boolean not null default false,
  payment_method varchar,
  cash_source varchar,
  constraint expenses_branch_check check (branch in ('tailoring', 'fabrics', 'ready_designs')),
  constraint expenses_cash_source_check check (cash_source in ('box', 'external')),
  constraint expenses_payment_method_check check (payment_method in ('cash', 'network')),
  constraint expenses_recurrence_type_check check (recurrence_type in ('one_time', 'monthly')),
  constraint expenses_recurring_day_of_month_check check (recurring_day_of_month is null or (recurring_day_of_month >= 1 and recurring_day_of_month <= 31)),
  constraint expenses_recurring_source_month_unique unique (recurring_source_id, recurring_month),
  constraint expenses_type_check check (type in ('material', 'fixed', 'salary', 'other'))
);

-- live definitions (read 1 Oct 2026): same statements and attributes; line endings LF and the
-- INSERT column lists joined onto fewer lines (whitespace only)
create or replace function public.update_expenses_updated_at()
returns trigger language plpgsql as $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;
create trigger expenses_updated_at_trigger before update on public.expenses
  for each row execute function update_expenses_updated_at();

create or replace function public.generate_recurring_expenses(p_branch character varying default null::character varying, p_until date default current_date)
returns integer language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_template RECORD;
  v_day INTEGER;
  v_month DATE;
  v_start_month DATE;
  v_end_month DATE;
  v_due_date DATE;
  v_last_day INTEGER;
  v_inserted INTEGER := 0;
  v_rows INTEGER := 0;
BEGIN
  IF p_until IS NULL THEN
    p_until := CURRENT_DATE;
  END IF;

  FOR v_template IN
    SELECT *
    FROM expenses
    WHERE type IN ('fixed', 'salary')
      AND recurrence_type = 'monthly'
      AND recurring_source_id IS NULL
      AND (p_branch IS NULL OR branch = p_branch)
  LOOP
    v_day := COALESCE(v_template.recurring_day_of_month, EXTRACT(DAY FROM v_template.date)::INT);
    v_day := GREATEST(1, LEAST(31, v_day));

    v_start_month := (date_trunc('month', v_template.date)::DATE + INTERVAL '1 month')::DATE;
    v_end_month := date_trunc('month', p_until)::DATE;
    v_month := v_start_month;

    WHILE v_month <= v_end_month LOOP
      v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_month)::DATE + INTERVAL '1 month - 1 day'))::INT;
      v_due_date := make_date(
        EXTRACT(YEAR FROM v_month)::INT,
        EXTRACT(MONTH FROM v_month)::INT,
        LEAST(v_day, v_last_day)
      );

      IF v_due_date <= p_until THEN
        INSERT INTO expenses (
          branch, type, category, description, amount, date, notes, created_by,
          recurrence_type, recurring_day_of_month, recurring_source_id, recurring_month, is_auto_generated
        )
        VALUES (
          v_template.branch, v_template.type, v_template.category, v_template.description, v_template.amount,
          v_due_date, v_template.notes, v_template.created_by,
          'monthly', v_day, v_template.id, v_month, true
        )
        ON CONFLICT (recurring_source_id, recurring_month) DO NOTHING;

        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_inserted := v_inserted + v_rows;
      END IF;

      v_month := (v_month + INTERVAL '1 month')::DATE;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

create table public.fabric_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.fabric_inventory(id) on delete cascade,
  movement_type varchar not null,
  quantity numeric(12, 2) not null,
  cost_per_unit numeric,
  description text,
  purchase_expense_id uuid,
  date date not null default current_date,
  created_at timestamptz default now(),
  created_by uuid,
  color_id uuid references public.fabric_inventory_colors(id) on delete set null,
  sale_income_id uuid references public.income(id) on delete cascade,
  sale_line_index integer
);
create unique index on public.fabric_inventory_movements (sale_income_id, sale_line_index)
  where sale_income_id is not null;

-- live definitions (verbatim)
create or replace function public.update_inventory_quantity()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.movement_type = 'in' THEN
            UPDATE fabric_inventory SET current_quantity = current_quantity + NEW.quantity WHERE id = NEW.inventory_item_id;
        ELSE
            UPDATE fabric_inventory SET current_quantity = current_quantity - NEW.quantity WHERE id = NEW.inventory_item_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.movement_type = 'in' THEN
            UPDATE fabric_inventory SET current_quantity = current_quantity - OLD.quantity WHERE id = OLD.inventory_item_id;
        ELSE
            UPDATE fabric_inventory SET current_quantity = current_quantity + OLD.quantity WHERE id = OLD.inventory_item_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

create or replace function public.update_color_quantity()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.color_id IS NOT NULL THEN
            IF NEW.movement_type = 'in' THEN
                UPDATE fabric_inventory_colors SET current_quantity = current_quantity + NEW.quantity WHERE id = NEW.color_id;
            ELSE
                UPDATE fabric_inventory_colors SET current_quantity = current_quantity - NEW.quantity WHERE id = NEW.color_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.color_id IS NOT NULL THEN
            IF OLD.movement_type = 'in' THEN
                UPDATE fabric_inventory_colors SET current_quantity = current_quantity - OLD.quantity WHERE id = OLD.color_id;
            ELSE
                UPDATE fabric_inventory_colors SET current_quantity = current_quantity + OLD.quantity WHERE id = OLD.color_id;
            END IF;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

create or replace function public.set_income_invoice_number()
returns trigger language plpgsql as $function$
BEGIN
  IF NEW.branch = 'fabrics' AND NEW.invoice_number IS NULL THEN
    NEW.invoice_number := nextval('fabrics_invoice_number_seq');
  END IF;
  RETURN NEW;
END;
$function$;
