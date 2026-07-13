/**
 * Life Map health — reasons to reopen a parent file.
 * Checks: bank · care phone · sibling unlocker · fridge QR step
 */

export function computeLifeMapHealth(estate, store) {
  const items = (store.items || []).filter((i) => i.estateId === estate.id);
  const members = (store.members || []).filter(
    (m) => m.estateId === estate.id && m.status === 'active'
  );

  const hasBank = items.some((i) => i.category === 'bank');
  const hasCarePhone = items.some((i) => {
    if (i.category !== 'care') return false;
    const phone = String(i.accountRef || i.backupContact || i.notes || '').trim();
    return phone.length >= 7 || /\+?\d[\d\s-]{6,}/.test(phone);
  });

  const unlockers = estate.unlockRules?.unlockerUserIds || [estate.ownerId];
  const siblingUnlocker =
    unlockers.some((id) => id && id !== estate.ownerId) ||
    members.some((m) => m.userId !== estate.ownerId && m.role === 'manager');

  const hw = estate.housewarming || {};
  const fridgeQrDone =
    (hw.completedSteps || []).includes('qr') || Boolean(hw.completedAt);

  const checks = [
    { id: 'bank', label: 'Bank', ok: hasBank, hint: 'Add at least one bank' },
    { id: 'care', label: 'Care phone', ok: hasCarePhone, hint: 'Add maid/nurse with a phone' },
    {
      id: 'unlocker',
      label: 'Sibling unlocker',
      ok: siblingUnlocker,
      hint: 'Invite a sibling as manager',
    },
    {
      id: 'qr',
      label: 'Fridge QR',
      ok: fridgeQrDone,
      hint: 'Finish housewarming QR step / share emergency card',
    },
  ];

  const done = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const percent = Math.round((done / total) * 100);
  const next = checks.find((c) => !c.ok) || null;

  return {
    done,
    total,
    percent,
    scoreLabel: `${done}/${total}`,
    checks,
    next,
    ready: done === total,
  };
}
