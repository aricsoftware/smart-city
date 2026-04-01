// ── Source protection (deterrent-level) ──
(function(){
  // Disable right-click context menu
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); }, true);
  // Block common view-source / devtools shortcuts
  document.addEventListener('keydown', function(e){
    var k = e.key || '';
    // F12
    if (k === 'F12') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    // Ctrl/Cmd combos: U (view-source), S (save), Shift+I, Shift+J, Shift+C
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === 'u' || k === 'U') { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (k === 's' || k === 'S') { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.shiftKey && (k === 'I' || k === 'i' || k === 'J' || k === 'j' || k === 'C' || k === 'c')) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
    }
  }, true);
})();
