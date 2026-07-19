-- Blogger RSS Bot - Supabase şeması
-- Bunu Supabase panelinde: SQL Editor -> New query -> yapıştır -> Run

create extension if not exists "pgcrypto";

-- Takip edilecek RSS kaynakları
create table if not exists feeds (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,                 -- RSS/Atom adresi
  labels text,                               -- Blogger etiket/kategori, virgülle ayrılmış: "teknoloji, haber"
  interval_minutes int not null default 60,  -- bu feed kaç dakikada bir kontrol edilsin
  max_items_per_run int not null default 5,  -- her çalıştırmada en fazla kaç yeni içerik paylaşılsın
  active boolean not null default true,      -- kapatmak istersen false yap, silmene gerek yok
  last_checked timestamptz,
  created_at timestamptz not null default now()
);

-- Daha önce paylaşılan içerikleri takip eder (tekrar paylaşımı engeller)
create table if not exists posted_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references feeds(id) on delete cascade,
  guid text not null,       -- RSS öğesinin benzersiz kimliği (genelde link)
  title text,
  link text,
  posted_at timestamptz not null default now(),
  unique (feed_id, guid)
);

create index if not exists idx_posted_items_feed on posted_items(feed_id);
create index if not exists idx_feeds_active on feeds(active);

-- Örnek: yeni bir RSS kaynağı eklemek
-- insert into feeds (url, labels, interval_minutes) values
-- ('https://ornek-site.com/feed', 'teknoloji, yazılım', 30);
