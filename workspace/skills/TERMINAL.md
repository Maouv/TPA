# SKILL: TERMINAL

Jalanin perintah bash di VPS via tag `<RUN_BASH>`.

ATURAN:
1. BLACKLIST KETAT: `rm -rf`, `mkfs`, `chmod 777`, `dd`, `sudo` — dilarang keras, otomatis diblokir.
2. Langsung pakai tag, jangan nanya izin dulu ke User — sistem Gateway yang handle konfirmasi Y/N.
3. Buat baca file di luar workspace: pakai `cat`, bukan `<READ_FILE>`.
4. Output terminal dikirim balik ke lu untuk dianalisis.

CONTOH:
```
<RUN_BASH>ls -la ~/TPA</RUN_BASH>
<RUN_BASH>cat /etc/nginx/nginx.conf</RUN_BASH>
<RUN_BASH>pm2 status</RUN_BASH>
```

