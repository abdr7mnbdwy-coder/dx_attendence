-- Diagnostic Clinic Attendance Planner
-- يتطلب Supabase Auth. كل مستخدم يرى سجلاته فقط عبر user_id وRLS.
-- شغّل هذا الملف مرة واحدة من Supabase Dashboard > SQL Editor.

create table if not exists public.clinic_attendance_doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  doctor_name text not null check (length(trim(doctor_name)) between 1 and 100),
  weekday smallint not null check (weekday in (0,1,2,3,4,6)),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_doctors_user_month
  on public.clinic_attendance_doctors(user_id, month_key);

create table if not exists public.clinic_attendance_replacements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  doctor_name text not null check (length(trim(doctor_name)) between 1 and 100),
  missed_date date,
  replacement_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint replacement_dates_differ check (missed_date is null or missed_date <> replacement_date)
);

create index if not exists idx_attendance_replacements_user_month
  on public.clinic_attendance_replacements(user_id, month_key);

alter table public.clinic_attendance_doctors enable row level security;
alter table public.clinic_attendance_replacements enable row level security;

drop policy if exists "Users can view own attendance doctors" on public.clinic_attendance_doctors;
create policy "Users can view own attendance doctors"
on public.clinic_attendance_doctors for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own attendance doctors" on public.clinic_attendance_doctors;
create policy "Users can insert own attendance doctors"
on public.clinic_attendance_doctors for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own attendance doctors" on public.clinic_attendance_doctors;
create policy "Users can update own attendance doctors"
on public.clinic_attendance_doctors for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own attendance doctors" on public.clinic_attendance_doctors;
create policy "Users can delete own attendance doctors"
on public.clinic_attendance_doctors for delete
using (auth.uid() = user_id);

drop policy if exists "Users can view own attendance replacements" on public.clinic_attendance_replacements;
create policy "Users can view own attendance replacements"
on public.clinic_attendance_replacements for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own attendance replacements" on public.clinic_attendance_replacements;
create policy "Users can insert own attendance replacements"
on public.clinic_attendance_replacements for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own attendance replacements" on public.clinic_attendance_replacements;
create policy "Users can update own attendance replacements"
on public.clinic_attendance_replacements for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own attendance replacements" on public.clinic_attendance_replacements;
create policy "Users can delete own attendance replacements"
on public.clinic_attendance_replacements for delete
using (auth.uid() = user_id);

-- لا تضع service_role key داخل ملفات المتصفح. استخدم anon/publishable key فقط.
-- يجب أن يكون المستخدم مسجل الدخول في Supabase Auth قبل فتح التطبيق.
