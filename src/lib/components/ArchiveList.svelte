<script lang="ts">
  import { t } from '$lib/i18n';
  import { invalidateAll } from '$app/navigation';
  import { api } from '$lib/client/api';
  import { categories } from '$lib/types';
  import ConfirmDialog from './ConfirmDialog.svelte';
  let { data, admin = false } = $props();
  let deleting = $state<string | null>(null);
  let pendingDelete = $state<string | null>(null);
  async function deleteDocument(id: string) {
    pendingDelete = id;
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete;
    pendingDelete = null;
    deleting = id;
    try {
      await api(`documents/${id}`, { method: 'DELETE' });
      await invalidateAll();
    } finally {
      deleting = null;
    }
  }
</script>

<section class="archive">
  <div class="section-heading">
    <div>
      <span class="eyebrow">YOGILIB / COLLECTION</span>
      <h1>{$t(admin ? 'Dashboard' : 'Archive')}</h1>
    </div>
    <span class="count">{data.total} {$t('Works')}</span>
  </div>
  <form class="search" method="GET">
    <label class="sr-only" for="query">{$t('Search')}</label><input
      id="query"
      name="q"
      type="search"
      value={data.query}
      placeholder="Search titles, passages · शीर्षक, अंश"
    /><input type="hidden" name="cat" value={data.category} /><button
      class="primary">{$t('Search')}</button
    >
  </form>
  <nav class="categories" aria-label="Categories">
    {#each categories as cat}<a
        class:chosen={cat === data.category}
        href={`?cat=${encodeURIComponent(cat)}&q=${encodeURIComponent(data.query || '')}`}
        >{$t(cat)}</a
      >{/each}
  </nav>
  <div class="document-list">
    {#each data.documents as doc}<article class="document-row">
        <div class="document-symbol" aria-hidden="true">ग्रन्थ</div>
        <div class="document-summary">
          <span class="eyebrow">{$t(doc.category)} · {doc.lang}</span>
          <h2>
            <a href={`/document/${doc.id}`}>{doc.title_np || doc.title}</a>
          </h2>
          {#if doc.title_np}<p class="english-title">{doc.title}</p>{/if}
          <p>{doc.description}</p>
          <small
            >{doc.orig_author_np || doc.orig_author}
            {doc.orig_year ? '· ' + doc.orig_year : ''}</small
          >
        </div>
        {#if admin}<div class="document-actions">
            <a class="button" href={`/document/${doc.id}/edit`}>{$t('Edit')}</a>
            <button
              class="danger"
              disabled={deleting === doc.id}
              onclick={() => deleteDocument(doc.id)}
            >{deleting === doc.id ? 'Deleting…' : $t('Delete')}</button>
          </div>{/if}
      </article>{:else}<p class="empty">{$t('No documents found.')}</p>{/each}
  </div>
  <div class="pager">
    {#if data.offset > 0}<a
        class="button"
        href={`?q=${encodeURIComponent(data.query || '')}&cat=${encodeURIComponent(data.category)}&offset=${Math.max(0, data.offset - 40)}`}
        >{$t('Previous')}</a
      >{/if}{#if data.offset + 40 < data.total}<a
        class="button"
        href={`?q=${encodeURIComponent(data.query || '')}&cat=${encodeURIComponent(data.category)}&offset=${data.offset + 40}`}
        >{$t('Next')}</a
      >{/if}
  </div>
</section>
<ConfirmDialog
  open={pendingDelete !== null}
  title="Delete document?"
  message="This document will be permanently deleted. This cannot be undone."
  busy={deleting !== null}
  onconfirm={confirmDelete}
  oncancel={() => (pendingDelete = null)}
/>
