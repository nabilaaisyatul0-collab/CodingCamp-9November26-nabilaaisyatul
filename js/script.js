/* =========================================================
   script.js — Expense & Budget Visualizer
   =========================================================
   Fitur:
   - Tambah & hapus transaksi
   - Validasi form (nama, jumlah, kategori wajib diisi)
   - Simpan data ke LocalStorage
   - Hitung total pengeluaran otomatis
   - Gambar pie chart SVG berdasarkan kategori
   - Pie chart update otomatis saat transaksi berubah
   ========================================================= */

/* ── Konstanta Warna per Kategori ── */
const CATEGORY_COLORS = {
  Food:      '#ed8936',   // oranye
  Transport: '#3182ce',   // biru
  Fun:       '#38a169',   // hijau
};

/* ── Emoji per Kategori ── */
const CATEGORY_EMOJI = {
  Food:      '🍔',
  Transport: '🚗',
  Fun:       '🎉',
};

/* ── Key LocalStorage ── */
const STORAGE_KEY = 'expense_visualizer_data';

/* ── Ambil Referensi DOM ── */
const form           = document.getElementById('expense-form');
const inputName      = document.getElementById('item-name');
const inputAmount    = document.getElementById('amount');
const inputCategory  = document.getElementById('category');
const errorName      = document.getElementById('error-name');
const errorAmount    = document.getElementById('error-amount');
const errorCategory  = document.getElementById('error-category');
const totalAmountEl  = document.getElementById('total-amount');
const transactionList = document.getElementById('transaction-list');
const emptyListMsg   = document.getElementById('empty-list-msg');
const pieChart       = document.getElementById('pie-chart');
const legend         = document.getElementById('legend');
const emptyChartMsg  = document.getElementById('empty-chart-msg');

/* =========================================================
   1. MANAJEMEN DATA (LocalStorage)
   ========================================================= */

/**
 * Memuat data transaksi dari LocalStorage.
 * Mengembalikan array kosong jika belum ada data.
 */
function loadTransactions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Menyimpan array transaksi ke LocalStorage.
 * @param {Array} transactions
 */
function saveTransactions(transactions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* =========================================================
   2. RENDER DAFTAR TRANSAKSI
   ========================================================= */

/**
 * Memformat angka menjadi format Rupiah.
 * @param {number} num
 * @returns {string}  "Rp 25.000"
 */
function formatRupiah(num) {
  return 'Rp ' + num.toLocaleString('id-ID');
}

/**
 * Merender seluruh daftar transaksi ke dalam <ul>.
 * Dipanggil ulang setiap kali data berubah.
 * @param {Array} transactions
 */
function renderTransactions(transactions) {
  // Kosongkan daftar sebelum mengisi ulang
  transactionList.innerHTML = '';

  if (transactions.length === 0) {
    emptyListMsg.style.display = 'block';
    return;
  }

  emptyListMsg.style.display = 'none';

  transactions.forEach((tx) => {
    const li = document.createElement('li');
    li.className = 'transaction-item';
    li.dataset.category = tx.category;

    li.innerHTML = `
      <div class="item-info">
        <span class="item-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</span>
        <span class="item-meta">
          <span class="category-badge badge-${tx.category}">
            ${CATEGORY_EMOJI[tx.category]} ${tx.category}
          </span>
        </span>
      </div>
      <span class="item-amount">${formatRupiah(tx.amount)}</span>
      <button class="btn-delete" data-id="${tx.id}" aria-label="Hapus ${escapeHtml(tx.name)}">
        Hapus
      </button>
    `;

    transactionList.appendChild(li);
  });
}

/* =========================================================
   3. HITUNG TOTAL
   ========================================================= */

/**
 * Menghitung total seluruh transaksi dan memperbarui tampilan.
 * @param {Array} transactions
 */
function renderTotal(transactions) {
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalAmountEl.textContent = formatRupiah(total);
}

/* =========================================================
   4. PIE CHART SVG
   ========================================================= */

/**
 * Mengelompokkan transaksi berdasarkan kategori dan
 * menjumlahkan amount-nya.
 * @param {Array} transactions
 * @returns {Object}  { Food: 50000, Transport: 30000, ... }
 */
function groupByCategory(transactions) {
  return transactions.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});
}

/**
 * Mengonversi sudut polar ke koordinat kartesian pada lingkaran SVG.
 * @param {number} cx       - pusat x
 * @param {number} cy       - pusat y
 * @param {number} r        - jari-jari
 * @param {number} angleDeg - sudut dalam derajat (0 = atas, searah jarum jam)
 * @returns {{ x: number, y: number }}
 */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Membuat path data SVG untuk satu irisan (slice) pie chart.
 * @param {number} cx       - pusat x
 * @param {number} cy       - pusat y
 * @param {number} r        - jari-jari
 * @param {number} startDeg - sudut mulai (derajat)
 * @param {number} endDeg   - sudut akhir (derajat)
 * @returns {string}        - atribut "d" untuk elemen <path>
 */
function buildPieSlicePath(cx, cy, r, startDeg, endDeg) {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end   = polarToCartesian(cx, cy, r, endDeg);
  // largeArcFlag = 1 jika irisan > 180 derajat
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

/**
 * Menggambar pie chart SVG dan legend berdasarkan data transaksi.
 * @param {Array} transactions
 */
function renderPieChart(transactions) {
  // Bersihkan chart dan legend sebelumnya
  pieChart.innerHTML = '';
  legend.innerHTML  = '';

  if (transactions.length === 0) {
    emptyChartMsg.style.display = 'block';
    pieChart.style.display      = 'none';
    legend.style.display        = 'none';
    return;
  }

  emptyChartMsg.style.display = 'none';
  pieChart.style.display      = 'block';
  legend.style.display        = 'flex';

  const grouped = groupByCategory(transactions);
  const total   = Object.values(grouped).reduce((s, v) => s + v, 0);
  const cx = 100, cy = 100, r = 90; // koordinat SVG viewBox 200x200
  let currentAngle = 0;

  Object.entries(grouped).forEach(([category, amount]) => {
    const sliceDeg = (amount / total) * 360;
    const endAngle = currentAngle + sliceDeg;
    const color    = CATEGORY_COLORS[category];
    const percent  = ((amount / total) * 100).toFixed(1);

    // ── Gambar irisan ──
    if (sliceDeg >= 360) {
      // Kasus khusus: hanya satu kategori → gambar lingkaran penuh
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', color);
      pieChart.appendChild(circle);
    } else {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', buildPieSlicePath(cx, cy, r, currentAngle, endAngle));
      path.setAttribute('fill', color);
      // Tooltip bawaan browser
      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleEl.textContent = `${CATEGORY_EMOJI[category]} ${category}: ${formatRupiah(amount)} (${percent}%)`;
      path.appendChild(titleEl);
      pieChart.appendChild(path);
    }

    currentAngle = endAngle;

    // ── Tambah legend item ──
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <span class="legend-dot" style="background:${color}"></span>
      <span>${CATEGORY_EMOJI[category]} ${category}: <strong>${percent}%</strong></span>
    `;
    legend.appendChild(legendItem);
  });
}

/* =========================================================
   5. RENDER SEMUA (helper)
   ========================================================= */

/**
 * Memanggil semua fungsi render sekaligus.
 * Cukup panggil ini setiap kali data berubah.
 * @param {Array} transactions
 */
function renderAll(transactions) {
  renderTransactions(transactions);
  renderTotal(transactions);
  renderPieChart(transactions);
}

/* =========================================================
   6. VALIDASI FORM
   ========================================================= */

/**
 * Menampilkan pesan error dan menambahkan class error pada input.
 * @param {HTMLElement} input
 * @param {HTMLElement} errorEl
 * @param {string}      message
 */
function showError(input, errorEl, message) {
  errorEl.textContent = message;
  input.classList.add('input-error');
}

/**
 * Menghapus pesan error dan class error dari input.
 * @param {HTMLElement} input
 * @param {HTMLElement} errorEl
 */
function clearError(input, errorEl) {
  errorEl.textContent = '';
  input.classList.remove('input-error');
}

/**
 * Memvalidasi semua input form.
 * @returns {boolean} true jika semua valid
 */
function validateForm() {
  let isValid = true;

  // Validasi Nama Item
  if (inputName.value.trim() === '') {
    showError(inputName, errorName, 'Nama item wajib diisi.');
    isValid = false;
  } else {
    clearError(inputName, errorName);
  }

  // Validasi Jumlah
  const amountVal = parseFloat(inputAmount.value);
  if (inputAmount.value.trim() === '' || isNaN(amountVal) || amountVal <= 0) {
    showError(inputAmount, errorAmount, 'Jumlah harus berupa angka lebih dari 0.');
    isValid = false;
  } else {
    clearError(inputAmount, errorAmount);
  }

  // Validasi Kategori
  if (inputCategory.value === '') {
    showError(inputCategory, errorCategory, 'Pilih salah satu kategori.');
    isValid = false;
  } else {
    clearError(inputCategory, errorCategory);
  }

  return isValid;
}

/* =========================================================
   7. EVENT — SUBMIT FORM (Tambah Transaksi)
   ========================================================= */

form.addEventListener('submit', (e) => {
  e.preventDefault(); // Cegah reload halaman

  // Jalankan validasi terlebih dahulu
  if (!validateForm()) return;

  // Buat objek transaksi baru
  const newTransaction = {
    id:       Date.now(),            // ID unik berbasis timestamp
    name:     inputName.value.trim(),
    amount:   parseFloat(inputAmount.value),
    category: inputCategory.value,
  };

  // Muat data lama, tambahkan transaksi baru, simpan kembali
  const transactions = loadTransactions();
  transactions.push(newTransaction);
  saveTransactions(transactions);

  // Perbarui tampilan
  renderAll(transactions);

  // Reset form ke kondisi awal
  form.reset();
  clearError(inputName, errorName);
  clearError(inputAmount, errorAmount);
  clearError(inputCategory, errorCategory);
});

/* =========================================================
   8. EVENT — HAPUS TRANSAKSI (Event Delegation)
   ========================================================= */

/**
 * Menggunakan event delegation pada <ul> agar satu listener
 * cukup untuk semua tombol Hapus yang ada maupun yang akan datang.
 */
transactionList.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return; // Klik bukan pada tombol Hapus

  const id = Number(btn.dataset.id);

  // Filter transaksi yang id-nya bukan yang dihapus
  let transactions = loadTransactions();
  transactions = transactions.filter((tx) => tx.id !== id);
  saveTransactions(transactions);

  // Perbarui tampilan
  renderAll(transactions);
});

/* =========================================================
   9. HAPUS ERROR SAAT USER MULAI MENGETIK
   ========================================================= */

inputName.addEventListener('input', () => clearError(inputName, errorName));
inputAmount.addEventListener('input', () => clearError(inputAmount, errorAmount));
inputCategory.addEventListener('change', () => clearError(inputCategory, errorCategory));

/* =========================================================
   10. UTILITY — Escape HTML untuk mencegah XSS
   ========================================================= */

/**
 * Mengubah karakter khusus HTML menjadi entity-nya.
 * Mencegah injeksi HTML/XSS ketika menampilkan input pengguna.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =========================================================
   11. INIT — Jalankan saat halaman pertama kali dimuat
   ========================================================= */

(function init() {
  const transactions = loadTransactions();
  renderAll(transactions);
})();
