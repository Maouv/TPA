# SKILL: FILEMANAGER

Baca dan tulis file di dalam `workspace/` via tag `<READ_FILE>` dan `<WRITE_FILE>`.

ATURAN:
1. `<READ_FILE>` — tidak butuh izin, langsung baca.
2. `<WRITE_FILE>` — butuh konfirmasi Y/N dari User.
3. HANYA di dalam `workspace/`. Akses ke luar folder ini otomatis diblokir.
4. Kalau mau baca file di luar workspace (kode bot, config sistem, dll) — pakai `<RUN_BASH>cat /path/file</RUN_BASH>`.
5. Kalau mau bikin file baru (script, dokumen, dll) — tulis ke `workspace/files/`.

CONTOH:
```
<READ_FILE>MEMORY.md</READ_FILE>
<READ_FILE>files/script.js</READ_FILE>
<WRITE_FILE path="files/hasil.md">isi konten di sini</WRITE_FILE>
```

