export function initMileageEditor() {
  const el = id => document.getElementById(id);
  const dialog = el('nativeMileageDialog'), input = el('nativeMileageInput');
  const save = el('nativeMileageSave'), cancel = el('nativeMileageCancel');
  const status = el('nativeMileageStatus');
  let carId = null, busy = false, generation = 0, trigger = null;
  function setBusy(value) { busy = value; input.disabled = save.disabled = cancel.disabled = value; }
  function close() { if (busy) return; dialog.close(); trigger?.focus(); }
  el('carsList').addEventListener('click', event => {
    const button = event.target.closest('[data-mileage-car]');
    if (!button || busy) return;
    carId = Number(button.dataset.mileageCar);
    const car = window.getMileageCar(carId);
    if (!car) return;
    trigger = button;
    el('nativeMileageCar').textContent = car.title || [car.brand, car.model].filter(Boolean).join(' ');
    input.value = car.mileage === null || car.mileage === undefined ? '' : String(car.mileage);
    status.textContent = '';
    dialog.showModal(); input.focus(); input.select();
  });
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  el('nativeMileageForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const text = input.value.replace(/\s/gu, '');
    const mileage = Number(text);
    if (!/^\d{1,7}$/.test(text) || !Number.isSafeInteger(mileage) || mileage < 0 || mileage > 9999999) {
      status.textContent = 'Вкажіть цілий пробіг від 0 до 9 999 999 км.'; return;
    }
    const capturedGeneration = generation, capturedId = carId;
    setBusy(true); status.textContent = 'Зберігаємо…';
    try {
      const response = await window.KarpNative.request('cars/mileage', {method:'POST',body:JSON.stringify({car_id:capturedId,mileage})});
      const data = await response.json();
      if (capturedGeneration !== generation) return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Не вдалося зберегти пробіг.');
      window.applyCarMileage(capturedId, data.mileage);
      dialog.close();
      document.querySelector(`[data-mileage-car="${capturedId}"]`)?.focus();
    } catch (error) {
      if (capturedGeneration === generation) status.textContent = error.message || 'Перевірте інтернет і спробуйте ще раз.';
    } finally { if (capturedGeneration === generation) setBusy(false); }
  });
  return { reset() { generation++; dialog.close(); input.value = ''; status.textContent = ''; carId = null; trigger = null; setBusy(false); } };
}
