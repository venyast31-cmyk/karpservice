export function initProfileEditor() {
  const el = id => document.getElementById(id);
  const summary = el('nativeProfileDialog');
  const trigger = el('nativeEditProfile');
  // WebKit can restore :focus-visible after closing a dialog with a text field.
  // Show the ring only for keyboard navigation, never after a touchscreen tap.
  document.addEventListener('pointerdown', () => trigger.classList.remove('keyboard-focus'), true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') trigger.classList.add('keyboard-focus');
  }, true);
  const fieldDialog = el('nativeFieldDialog');
  const phoneDialog = el('nativePhoneDialog');
  const input = el('nativeFieldInput');
  const flow = el('nativePhoneFlow');
  const home = flow.parentNode;
  const next = flow.nextSibling;
  let field = 'name', busy = false, generation = 0;
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  function refresh() {
    const profile = window.getEditableProfile();
    el('nativeProfileNameValue').textContent = profile.name || 'Не вказано';
    el('nativeProfilePhoneValue').textContent = profile.phone || 'Не підключено';
    el('nativeProfileBirthValue').textContent = profile.birth_date ? profile.birth_date.split('-').reverse().join('.') : 'Не вказано';
  }
  function openSummary() {
    refresh();
    if (!summary.open) summary.showModal();
  }
  function openField(key) {
    field = key;
    const birth = key === 'birth_date';
    const label = birth ? 'Дата народження' : 'Ім’я';
    el('nativeFieldTitle').textContent = label;
    el('nativeFieldLabel').textContent = label;
    input.type = birth ? 'date' : 'text';
    input.required = !birth;
    input.autocomplete = birth ? 'bday' : 'name';
    if (birth) { input.min = '1900-01-01'; input.max = localToday(); }
    else { input.removeAttribute('min'); input.removeAttribute('max'); }
    input.value = window.getEditableProfile()[key] || '';
    el('nativeFieldStatus').textContent = '';
    summary.close();
    fieldDialog.showModal();
    input.focus();
  }
  function cancelField() { if (!busy) { fieldDialog.close(); openSummary(); } }
  function restorePhone() { home.insertBefore(flow, next); }
  function cancelPhone() {
    // A verification already in progress may commit; wait for its result.
    if (el('verifyCodeBtn').disabled || el('loadBtn').disabled) return;
    window.resetAuthFlow({ clearPhone: true });
    phoneDialog.close(); restorePhone(); openSummary();
  }
  el('nativeEditProfile').addEventListener('click', openSummary);
  el('nativeEditProfile').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSummary(); }
  });
  el('nativeChooseName').addEventListener('click', () => openField('name'));
  el('nativeChooseBirth').addEventListener('click', () => openField('birth_date'));
  el('nativeChoosePhone').addEventListener('click', () => {
    window.resetAuthFlow();
    el('phone').value = window.getEditableProfile().phone || '+380 ';
    el('nativePhoneContainer').append(flow);
    summary.close(); phoneDialog.showModal(); el('phone').focus();
  });
  el('nativeCloseProfile').addEventListener('click', () => summary.close());
  el('nativeFieldCancel').addEventListener('click', cancelField);
  el('nativePhoneCancel').addEventListener('click', cancelPhone);
  fieldDialog.addEventListener('cancel', e => { e.preventDefault(); cancelField(); });
  phoneDialog.addEventListener('cancel', e => { e.preventDefault(); cancelPhone(); });
  el('nativeFieldForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !input.reportValidity()) return;
    const value = field === 'name' ? input.value.trim().replace(/\s+/gu, ' ') : input.value;
    const status = el('nativeFieldStatus');
    if (field === 'name' && !value) { status.textContent = 'Введіть ім’я.'; return; }
    const captured = generation, submittedField = field;
    busy = true;
    input.disabled = el('nativeFieldSave').disabled = el('nativeFieldCancel').disabled = true;
    status.textContent = 'Зберігаємо…';
    try {
      const route = field === 'name' ? 'account/name' : 'account/birth-date';
      const response = await window.KarpNative.request(route, { method: 'POST', body: JSON.stringify({ [field]: value }) });
      const data = await response.json();
      if (captured !== generation) return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Не вдалося зберегти зміни.');
      window.applyProfileField(submittedField, data[submittedField]);
      fieldDialog.close();
      el('nativeProfileSaved').textContent = 'Зміни збережено.';
      openSummary();
    } catch (error) {
      if (captured === generation) status.textContent = error.message || 'Перевірте інтернет і спробуйте ще раз.';
    } finally {
      if (captured === generation) {
        busy = false;
        input.disabled = el('nativeFieldSave').disabled = el('nativeFieldCancel').disabled = false;
      }
    }
  });
  return {
    get editingPhone() { return phoneDialog.open; },
    phoneSaved() {
      if (!phoneDialog.open) return;
      phoneDialog.close(); restorePhone();
      el('nativeProfileSaved').textContent = 'Номер телефону підтверджено.';
      openSummary();
    },
    reset() {
      generation++; busy = false;
      [summary, fieldDialog, phoneDialog].forEach(dialog => dialog.close());
      restorePhone(); input.value = '';
      input.disabled = el('nativeFieldSave').disabled = el('nativeFieldCancel').disabled = false;
      el('nativeProfileSaved').textContent = '';
    }
  };
}
