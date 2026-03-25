// Simple filter utility for tables
function filterTable(inputId, tableBodyId, rowFilterFn) {
  const input = document.getElementById(inputId);
  const tbody = document.getElementById(tableBodyId);
  if (!input || !tbody) return;
  const filter = input.value.toLowerCase();
  Array.from(tbody.children).forEach(row => {
    if (rowFilterFn(row, filter)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}
