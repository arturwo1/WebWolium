export function highlightNav() {
  const page = document.body?.dataset?.page;
  document.querySelectorAll(".nav__item").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.nav === page);
  });
}
