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

create table public.income (
  id uuid primary key default gen_random_uuid(),
  branch varchar not null,
  category varchar,
  customer_name varchar,
  description varchar,
  amount numeric,
  fabric_items jsonb,
  quantity_meters numeric,
  date date not null default current_date,
  created_by uuid,
  invoice_number bigint,
  fabric_inventory_tracked boolean not null default false,
  created_at timestamptz default now()
);
create sequence public.fabrics_invoice_number_seq;
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
