import { $ } from "../dom.js";

export function setLoggedInUI(session, cachedIdentity) {
  const btnLogin = $("#btnLogin");
  const userBox = $("#userBox");
  const avatarImg = $("#userAvatarImg");
  const form = $("#userSearch");
  const search = $("#searchUser");

  const meta = session?.user?.user_metadata || {};
  const url = meta.avatar_url || meta.picture || cachedIdentity?.avatar || null;

  const loggedIn = !!session || !!cachedIdentity;
  if (btnLogin) btnLogin.hidden = loggedIn;
  if (userBox) userBox.hidden = !loggedIn;
  if (userBox) form.hidden = !loggedIn;

  if (avatarImg && url) avatarImg.src = url;

  userBox?.classList.remove("loading");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = search.value.trim();
    if (!value) return;
    window.location.href = `/profile/?user_id=${encodeURIComponent(value)}`;
  });
}
