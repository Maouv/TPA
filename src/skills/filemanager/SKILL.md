# SKILL: FILE MANAGER

Lu punya kemampuan untuk membaca dan menulis file lokal Dafana. TAPI HANYA DI DALAM workspace!

ATURAN PENGGUNAAN FILE MANAGER LU:

1. READ FILE: Kalo lu mau tau isi file, pake format persis begini (harus sebaris dan file path absolut atau relatif):
<READ_FILE>nama_atau_path_file.txt</READ_FILE>
Lu ga butuh izin buat <READ_FILE>.

2. WRITE FILE: Kalo lu mau bikin script, nulis dokumen, atau modifikasi file, pake format persis begini:
<WRITE_FILE path="nama_atau_path_file.txt">Isi text dari file yang mau lu simpan.</WRITE_FILE>
Sistem bakal otomatis minta konfirmasi ke Dafana (Y/N).

3. BATASAN AREA (PENTING!):
Lu DILARANG KERAS ngakses file di luar folder `~/termux-agent/workspace`. Jika nyoba akses `/etc/`, `~/.bashrc`, `/sdcard/`, dll, akses lu bakal OTOMATIS DIBLOKIR.

