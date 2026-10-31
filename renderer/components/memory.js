'use strict';

window.LauncherMemory = function createMemoryControl($) {
  const slider = $('#ram');
  const hardware = $('#ram-hardware');
  return function renderMemory(memory) {
    if (!memory) {
      hardware.textContent = 'Detectando RAM…';
      return false;
    }
    slider.min = memory.minimumGB;
    slider.max = memory.maximumGB;
    hardware.textContent = `PC: ${memory.totalGB} GB${memory.supported ? '' : ' · insuficiente'}`;
    const description = memory.supported
      ? `Até ${memory.maximumGB} GB para o Minecraft; ${memory.reservedGB} GB reservados para o Windows e outros processos.`
      : 'RAM insuficiente: são necessários pelo menos 4 GB no computador.';
    hardware.title = description;
    slider.title = description;
    $('#ram-value').textContent = `${slider.value} GB`;
    return memory.supported;
  };
};
