import { stableStringify } from "@/lib/json.js";
import { fieldTypes } from "./fieldTypes.js";

const sameValue = (first, second) => stableStringify(first) === stableStringify(second);

function applyMasterToggle(group) {
  const master = group.fields.find((field) => field.master);
  return group.fields.map((field) => {
    const own = field.visibleWhen ? [].concat(field.visibleWhen) : [];
    const inherited = master && field !== master ? [{ field: master.key, truthy: true }] : [];
    return { ...field, conditions: [...inherited, ...own] };
  });
}

export function buildRegistryIndex(registry) {
  const fieldIndex = new Map();
  const categories = registry.map((category) => ({
    ...category,
    groups: category.groups.map((group) => {
      const entries = applyMasterToggle(group).map((field) => {
        const entry = { id: `${category.store}.${field.key}`, field };
        fieldIndex.set(entry.id, entry);
        return entry;
      });
      return { ...group, entries };
    })
  }));
  for (const category of categories) {
    for (const group of category.groups) {
      for (const entry of group.entries) {
        entry.category = category;
        entry.group = group;
      }
    }
  }
  return { categories, fieldIndex };
}

export function createSettingsState({ registry, values, context }) {
  const { categories, fieldIndex } = buildRegistryIndex(registry);
  const savedState = new Map();
  const draftState = new Map();

  for (const entry of fieldIndex.values()) {
    const raw = values?.[entry.category.store]?.[entry.field.key];
    const parsed = fieldTypes[entry.field.type].parse(raw, entry.field);
    savedState.set(entry.id, parsed);
    draftState.set(entry.id, parsed);
  }

  function getValue(id) {
    return draftState.get(id);
  }

  function getStoreValue(store, key) {
    return draftState.get(`${store}.${key}`);
  }

  function isChanged(id) {
    return !sameValue(savedState.get(id), draftState.get(id));
  }

  function isVisible(entry) {
    return entry.field.conditions.every((condition) => {
      const current = getStoreValue(entry.category.store, condition.field);
      if ("equals" in condition) return current === condition.equals;
      if ("in" in condition) return condition.in.includes(current);
      return Boolean(current);
    });
  }

  function getChangedIds() {
    return [...fieldIndex.keys()].filter(isChanged);
  }

  function getChanges() {
    const changes = {};
    for (const id of getChangedIds()) {
      const { field, category } = fieldIndex.get(id);
      changes[category.store] ??= {};
      changes[category.store][field.key] = fieldTypes[field.type].serialize(draftState.get(id));
    }
    return changes;
  }

  function validate() {
    const errors = new Map();
    for (const entry of fieldIndex.values()) {
      if (!isVisible(entry)) continue;
      const type = fieldTypes[entry.field.type];
      const messageKey = type.validate?.(entry.field, draftState.get(entry.id), context);
      if (messageKey) errors.set(entry.id, messageKey);
    }
    return errors;
  }

  return {
    categories,
    fieldIndex,
    getValue,
    getSavedValue: (id) => savedState.get(id),
    getStoreValue,
    setValue: (id, value) => draftState.set(id, value),
    isChanged,
    isVisible,
    getChangedIds,
    getChanges,
    validate,
    discard: () => {
      for (const [id, value] of savedState) draftState.set(id, value);
    },
    commit: () => {
      for (const [id, value] of draftState) savedState.set(id, value);
    }
  };
}
