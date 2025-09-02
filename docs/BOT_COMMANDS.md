# 📋 DAFTAR COMMAND BOT OSIS

## 📊 Command Excel & Statistik (Admin Only)

### `/excel`

Menghasilkan file Excel dengan data lengkap semua pendaftar

- **Format**: Data dalam 1 sheet "Data Lengkap Pendaftar"
- **Isi**: Semua kolom data pendaftar (20+ kolom)
- **Fitur**: Auto filter, status color coding, alternating row colors

### `/stats`

Menampilkan statistik rekrutmen secara keseluruhan

- Total pendaftar
- Jumlah diterima/ditolak/pending
- Tingkat penerimaan
- Total kelas & jurusan terwakili

### `/divisi`

Menampilkan statistik per divisi

- Jumlah pendaftar per divisi
- Ranking divisi berdasarkan popularitas

### `/kelas`

Menampilkan statistik per kelas

- Total pendaftar per kelas
- Tingkat penerimaan per kelas

### `/jurusan`

Menampilkan statistik per jurusan

- Total pendaftar per jurusan
- Tingkat penerimaan per jurusan

### `/trends`

Menampilkan tren pendaftaran bulanan

- Data 12 bulan terakhir
- Jumlah pendaftar per bulan

### `/backupdb`

Melakukan backup database sistem dan mengirimkannya via chat.

- **Format**: File `.sql` berisi dump database.
- **Akses**: Hanya admin di grup resmi.

## 🔍 Command Lainnya

### `/cari [kata kunci]`

Mencari data pendaftar berdasarkan nama/kelas/jurusan

### `/help`

Menampilkan bantuan penggunaan bot

## 📱 Akses Command

- **Command Excel & Statistik**: Hanya admin di grup resmi
- **Command Lainnya**: Semua member grup

## 📄 Format Excel Output

File Excel yang dihasilkan berisi:

- **Sheet tunggal**: "📋 Data Lengkap Pendaftar"
- **20+ kolom data**: Dari biodata hingga divisi diminati
- **Styling profesional**: Header biru, alternating colors
- **Status color coding**:
  - 🟢 Hijau: LOLOS/APPROVED
  - 🔴 Merah: DITOLAK/REJECTED
  - 🟡 Kuning: PENDING
- **Auto filter**: Untuk sorting dan filtering data
- **Frozen header**: Header tetap terlihat saat scroll

## 🎯 Keuntungan Sistem Baru

✅ **Excel Sederhana**: Fokus pada data lengkap, tidak ribet
✅ **Statistik via Bot**: Akses cepat statistik tanpa download
✅ **Multiple Views**: Berbagai perspektif data (divisi, kelas, jurusan)
✅ **Real-time**: Statistik selalu update terbaru
✅ **User Friendly**: Interface yang mudah dipahami
