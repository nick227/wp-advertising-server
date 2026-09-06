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

export function communityForumIndex(posts: PostListItem[], notice?: string): string {
  const pinned = posts.filter((p) => p.isPinned);
  const latest = posts.filter((p) => !p.isPinned);
  const renderList = (items: PostListItem[]) => items.map((p) => `
    <li>
      <a href="/community/posts/${encodeURIComponent(p.slug)}"><strong>${escapeHtml(p.title)}</strong></a>
      <div class="muted">${escapeHtml(p.author.displayName)} · ${escapeHtml(p.type)}${p.isPinned ? ' · pinned' : ''}${p.isLocked ? ' · locked' : ''} · ${p._count.comments} comments</div>
    </li>`).join('') || '<li class="muted">No posts yet.</li>';

  return `
  <section class="page-hero"><div class="wrap">
    <p class="brand-mark">Community</p>
    <h1>Member forum for publishers and advertisers.</h1>
    <p class="hero-lead">Simple Trial/Pro forum. Active members can post and comment. Expired members stay read-only.</p>
  </div></section>
  <section class="section" style="padding-top:0"><div class="wrap prose">
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
    <div class="notice">To join or post, use your Community <code>siteId</code> and <code>apiKey</code> from the WP Advertising plugin after registering with this service.</div>
    <h2>Pinned</h2>
    <ul>${renderList(pinned)}</ul>
    <h2>Latest</h2>
    <ul>${renderList(latest)}</ul>
    <h2>Join / start a discussion</h2>
    <form method="post" action="/community/join" style="display:grid;gap:0.75rem;max-width:32rem;margin-bottom:1.5rem">
      <label>Display name <input name="displayName" required maxlength="120" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>Site ID <input name="siteId" required style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>API key <input name="apiKey" required type="password" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <button class="btn btn-secondary" type="submit">Join Community</button>
    </form>
    <form method="post" action="/community/posts" style="display:grid;gap:0.75rem;max-width:32rem">
      <label>Title <input name="title" required maxlength="200" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>Body <textarea name="body" required rows="6" style="display:block;width:100%;padding:0.55rem;font:inherit"></textarea></label>
      <label>Site ID <input name="siteId" required style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>API key <input name="apiKey" required type="password" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <button class="btn btn-primary" type="submit">Create discussion</button>
    </form>
    <p style="margin-top:1.5rem"><a href="/pricing">Need Trial/Pro?</a></p>
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
}, notice?: string): string {
  const comments = post.comments.map((c) => `
    <article style="border-top:1px solid var(--line);padding:0.85rem 0">
      <strong>${escapeHtml(c.author.displayName)}</strong>
      <div class="muted">${escapeHtml(new Date(c.createdAt).toISOString())}</div>
      <p>${escapeHtml(c.body)}</p>
    </article>`).join('') || '<p class="muted">No comments yet.</p>';

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
    ${post.isLocked ? '<div class="notice">This post is locked.</div>' : `
    <h3>Add a comment</h3>
    <form method="post" action="/community/posts/${encodeURIComponent(post.slug)}/comments" style="display:grid;gap:0.75rem;max-width:32rem">
      <label>Comment <textarea name="body" required rows="4" style="display:block;width:100%;padding:0.55rem;font:inherit"></textarea></label>
      <label>Site ID <input name="siteId" required style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <label>API key <input name="apiKey" required type="password" style="display:block;width:100%;padding:0.55rem;font:inherit"></label>
      <button class="btn btn-primary" type="submit">Comment</button>
    </form>`}
  </div></section>`;
}
