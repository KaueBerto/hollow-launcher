'use strict';
window.LauncherMotion = function createMotion() {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = new Map();
  function animate(element, frames, duration = 240) {
    motion.get(element)?.cancel();
    motion.delete(element);
    if (reducedMotion.matches || document.hidden) return;
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    motion.set(element, animation);
    animation.finished.then(() => { if (motion.get(element) === animation) motion.delete(element); }).catch(() => {});
  }
  function showDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog(dialog) {
    if (!dialog.open || dialog.dataset.closing) return;
    if (reducedMotion.matches || document.hidden) { dialog.close(); return; }
    dialog.dataset.closing = 'true';
    dialog.inert = true;
    animate(dialog, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(6px) scale(.99)' }], 150);
    const animation = motion.get(dialog);
    const finish = () => { delete dialog.dataset.closing; dialog.inert = false; dialog.close(); };
    animation ? animation.finished.then(finish, finish) : finish();
  }
  return { reducedMotion, motion, animate, showDialog, closeDialog };
};
