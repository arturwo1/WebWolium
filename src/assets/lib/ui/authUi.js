import { $ } from "../dom.js";

export function setLoggedInUI(session, cachedIdentity) {
  const btnLogin = $("#btnLogin");
  const userBox = $("#userBox");
  const avatarImg = $("#userAvatarImg");
  const search = $("#userSearch");

  const meta = session?.user?.user_metadata || {};
  const url = meta.avatar_url || meta.picture || cachedIdentity?.avatar || null;

  const loggedIn = !!session || !!cachedIdentity;
  if (btnLogin) btnLogin.hidden = loggedIn;
  if (userBox) userBox.hidden = !loggedIn;

  if (avatarImg && url) avatarImg.src = url;

  userBox?.classList.remove("loading");

  search.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const value = search.value.trim();
    if (!value) return;

    window.location.href = `/profile/?user_id=${encodeURIComponent(value)}`;
  });
}
