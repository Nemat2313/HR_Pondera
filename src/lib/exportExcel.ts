import * as XLSX from 'xlsx';

export function exportToExcel(data: any[], fileName: string = 'personel_listesi.xlsx') {
  if (!data || data.length === 0) return;

  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Personel Verisi');

    // Auto-fit columns
    if (data.length > 0) {
      worksheet['!cols'] = Object.keys(data[0]).map((key) => ({
        wch: Math.max(key.length + 4, 14),
      }));
    }

    try {
      XLSX.writeFile(workbook, fileName);
    } catch {
      // Browser blob fallback
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1000);
    }
  } catch {
    // Graceful fallback without console error
  }
}
