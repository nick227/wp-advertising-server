function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type PostListItem = {
  id: string;
  title: string;
  slug: string;
  type: string;
  category: string | null;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: Date | string;
  author: { displayName: string; role: string };
  _count: { comments: number };
};

type ForumUser = {
  displayName: string;
} | null;

export function communityLoginPage(notice?: string): string {
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Community</p>
    <h1>Log in</h1>
    <p class="hero-lead">Use the email and password for your Community account.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
    <form method="post" action="/community/login" style="display:grid;gap:0.75rem;max-width:28rem">
      <label>Email <input name="email" type="email" required autocomplete="email" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>Password <input name="password" type="password" required autocomplete="current-password" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <button class="btn btn-primary" type="submit">Log in</button>
    </form>
    <p style="margin-top:1rem"><a href="/community/register">Create an account</a> · <a href="/community">Back to Community</a></p>
  </div></section>`;
}

export function communityRegisterPage(notice?: string, prefillEmail?: string): string {
  const emailValue = prefillEmail ? ` value="${escapeHtml(prefillEmail)}"` : '';
  const action = prefillEmail ? '/community/register?from=checkout' : '/community/register';
  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Community</p>
    <h1>Create an account</h1>
    <p class="hero-lead">Anyone can join. Use email and password — no plugin keys required.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
    <form method="post" action="${action}" style="display:grid;gap:0.75rem;max-width:28rem">
      <label>Display name <input name="displayName" required maxlength="120" autocomplete="nickname" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>Email <input name="email" type="email" required autocomplete="email"${emailValue} style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>Password <input name="password" type="password" required minlength="8" autocomplete="new-password" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <button class="btn btn-primary" type="submit">Create account</button>
    </form>
    <p style="margin-top:1rem"><a href="/community/login">Already have an account?</a> · <a href="/community">Back to Community</a></p>
  </div></section>`;
}

export function communityForumIndex(posts: PostListItem[], options?: { notice?: string; user?: ForumUser }): string {
  const notice = options?.notice;
  const user = options?.user ?? null;
  const pinned = posts.filter((p) => p.isPinned);
  const latest = posts.filter((p) => !p.isPinned);
  const renderList = (items: PostListItem[]) => items.map((p) => `
    <li>
      <a href="/community/posts/${encodeURIComponent(p.slug)}"><strong>${escapeHtml(p.title)}</strong></a>
      <div class="muted">${escapeHtml(p.author.displayName)} · ${escapeHtml(p.type)}${p.isPinned ? ' · pinned' : ''}${p.isLocked ? ' · locked' : ''} · ${p._count.comments} comments</div>
    </li>`).join('') || '<li class="muted">No posts yet.</li>';

  const authBlock = user
    ? `<div class="notice">Signed in as ${escapeHtml(user.displayName)}. You can start a discussion below.</div>
    <h2>Start a discussion</h2>
    <form method="post" action="/community/posts" style="display:grid;gap:0.75rem;max-width:32rem">
      <label>Title <input name="title" required maxlength="200" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>Body <textarea name="body" required rows="6" style="display:block;width:100%;padding:0.55rem;font:inherit"></textarea></label>
      <button class="btn btn-primary" type="submit">Create discussion</button>
    </form>`
    : `<div class="notice">Anyone can read. <a href="/community/login">Log in</a> or <a href="/community/register">create an account</a> to post.</div>`;

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Community</p>
    <h1>Talk about the plugin.</h1>
    <p class="hero-lead">A simple discussion space for WP Advertising users. Open to everyone with an account.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
    <h2>Pinned</h2>
    <ul>${renderList(pinned)}</ul>
    <h2>Latest</h2>
    <ul>${renderList(latest)}</ul>
    ${authBlock}
  </div></section>`;
}

export function communityForumPost(post: {
  title: string;
  slug: string;
  body: string;
  type: string;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: Date | string;
  author: { displayName: string; role: string };
  comments: Array<{ body: string; createdAt: Date | string; author: { displayName: string } }>;
}, options?: { notice?: string; user?: ForumUser }): string {
  const notice = options?.notice;
  const user = options?.user ?? null;
  const comments = post.comments.map((c) => `
    <article style="border-top:1px solid var(--line);padding:0.85rem 0">
      <strong>${escapeHtml(c.author.displayName)}</strong>
      <div class="muted">${escapeHtml(new Date(c.createdAt).toISOString())}</div>
      <p>${escapeHtml(c.body)}</p>
    </article>`).join('') || '<p class="muted">No comments yet.</p>';

  let commentForm = '';
  if (post.isLocked) {
    commentForm = '<div class="notice">This post is locked.</div>';
  } else if (user) {
    commentForm = `
    <h3>Add a comment</h3>
    <form method="post" action="/community/posts/${encodeURIComponent(post.slug)}/comments" style="display:grid;gap:0.75rem;max-width:32rem">
      <label>Comment <textarea name="body" required rows="4" style="display:block;width:100%;padding:0.55rem;font:inherit"></textarea></label>
      <button class="btn btn-primary" type="submit">Comment</button>
    </form>`;
  } else {
    commentForm = `<div class="notice"><a href="/community/login">Log in</a> to comment.</div>`;
  }

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Community</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="hero-lead">${escapeHtml(post.author.displayName)} · ${escapeHtml(post.type)}${post.isPinned ? ' · pinned' : ''}${post.isLocked ? ' · locked' : ''}</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    <p><a href="/community">← Community</a></p>
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
    <p style="white-space:pre-wrap">${escapeHtml(post.body)}</p>
    <h2>Comments</h2>
    ${comments}
    ${commentForm}
  </div></section>`;
}
