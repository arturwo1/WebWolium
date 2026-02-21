export function createInflightMap() {
  const map = new Map();

  return {
    get(key) {
      return map.get(key) || null;
    },
    set(key, promise) {
      map.set(key, promise);
    },
    delete(key) {
      map.delete(key);
    }
  };
}
