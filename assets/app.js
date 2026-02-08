if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => console.log('SW registered')).catch(e => console.warn('SW reg fail', e));
}