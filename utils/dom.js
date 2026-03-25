// dom.js - Utility for loading HTML components/pages
function loadHTML(targetId, url, callback) {
  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load ' + url + ' (' + res.status + ')');
      return res.text();
    })
    .then(function (html) {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.innerHTML = html;

      // innerHTML silently drops <script> tags — re-execute them manually
      const scripts = el.querySelectorAll('script');
      scripts.forEach(function(oldScript) {
        const newScript = document.createElement('script');
        // Copy all attributes (type, src, etc.)
        Array.from(oldScript.attributes).forEach(function(attr) {
          newScript.setAttribute(attr.name, attr.value);
        });
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });

      if (callback) callback();
    })
    .catch(function (err) {
      console.error('[loadHTML]', err);
      const el = document.getElementById(targetId);
      if (el) el.innerHTML = '<div class="alert alert-error p-4">' + err.message + '</div>';
    });
}

// global pagination helper
window.renderPaginationControls = function(currentPage, totalPages, containerId, fnName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="flex items-center gap-1.5 overflow-x-auto pb-1">';
    html += '<button onclick="window.'+fnName+'('+(currentPage-1)+')" '+(currentPage === 1 ? 'disabled' : '')+' class="px-2 py-1 border border-gray-200 rounded text-gray-600 text-[11px] font-bold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"><span class="material-icons text-[14px]">chevron_left</span></button>';
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    if(end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) {
        if (i === currentPage) {
            html += '<button class="px-2.5 py-1 border border-indigo-500 rounded bg-indigo-50 text-indigo-700 text-[11px] font-black shadow-sm">'+i+'</button>';
        } else {
            html += '<button onclick="window.'+fnName+'('+i+')" class="px-2.5 py-1 border border-gray-200 rounded bg-white text-gray-600 text-[11px] font-bold shadow-sm hover:bg-gray-50 transition">'+i+'</button>';
        }
    }
    html += '<button onclick="window.'+fnName+'('+(currentPage+1)+')" '+(currentPage === totalPages ? 'disabled' : '')+' class="px-2 py-1 border border-gray-200 rounded text-gray-600 text-[11px] font-bold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"><span class="material-icons text-[14px]">chevron_right</span></button>';
    html += '</div>';
    container.innerHTML = html;
};
