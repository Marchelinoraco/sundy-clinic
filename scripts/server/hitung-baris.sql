-- Jumlah baris setiap tabel di skema public, satu baris per tabel: "<tabel>|<jumlah>".
-- Dipakai untuk mencocokkan Neon vs VPS saat perpindahan dan saat uji pemulihan:
--   psql "$URL" -At -f scripts/server/hitung-baris.sql
SELECT table_name || '|' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
