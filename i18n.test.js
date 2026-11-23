const test = require("node:test");
const assert = require("node:assert/strict");
const { UI_STRINGS, translateKey, translateCategory, translateStatus } = require("../public/js/i18n");

test("English and Hindi dictionaries have 100% key parity", () => {
  const enKeys = Object.keys(UI_STRINGS.en).sort();
  const hiKeys = Object.keys(UI_STRINGS.hi).sort();
  assert.deepEqual(enKeys, hiKeys);

  assert.deepEqual(Object.keys(UI_STRINGS.en.categories).sort(), Object.keys(UI_STRINGS.hi.categories).sort());
  assert.deepEqual(Object.keys(UI_STRINGS.en.statuses).sort(), Object.keys(UI_STRINGS.hi.statuses).sort());
});

test("Translation helpers return localized Hindi and English labels", () => {
  assert.equal(translateKey("hi", "navBudget"), "बजट");
  assert.equal(translateCategory("hi", "Streetlights"), "स्ट्रीट लाइट");
  assert.equal(translateStatus("hi", "In Progress"), "कार्य प्रगति पर");
  assert.equal(translateStatus("en", "Resolved"), "Resolved");
});
