<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api, apiBase } from '$lib/client/api';
  import { t } from '$lib/i18n';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  let { data } = $props();
  const kinds: Record<string, string> = {
    'document.created': 'Created',
    'document.edited': 'Edited',
    'document.restored': 'Restored',
    'document.deleted': 'Deleted',
    'archive.cleared': 'Archive cleared',
  };
  let busy = $state(false);
  let error = $state('');
  let confirmAll = $state(false);
  async function deleteAll() {
    confirmAll = true;
  }
  async function confirmDeleteAll() {
    confirmAll = false;
    busy = true;
    error = '';
    try {
      await api('documents/all', { method: 'DELETE' });
      await goto('/dashboard');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="ledger-panel" aria-labelledby="ledger-title">
  <div class="section-heading">
    <div>
      <span class="eyebrow">YOGILIB / LEDGER</span>
      <h2 id="ledger-title">{$t('Archive ledger')}</h2>
    </div>
    <div class="ledger-actions">
      <a class="button" href={`${apiBase}/api/export`} download
        >{$t('Download backup')}</a
      >
      <button class="danger" disabled={busy} onclick={deleteAll}>
        {busy ? 'Deleting…' : 'Delete all documents'}
      </button>
    </div>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if !data.ledger?.available}
    <p class="muted">
      {$t('The ledger starts recording after migration 002 has been applied.')}
    </p>
  {:else}
    <p
      class:ledger-ok={data.ledger.ok}
      class:error={!data.ledger.ok}
      role="status"
    >
      {data.ledger.ok
        ? `${$t('History verified')} · ${data.ledger.count} ${$t('events')}`
        : `${$t('History check failed at event')} ${data.ledger.brokenAt}`}
      <code title={data.ledger.head}>{data.ledger.head.slice(0, 12)}</code>
    </p>
    {#if data.events.length}<ol class="ledger-events">
        {#each data.events as e}<li>
            <span class="eyebrow">#{e.seq} · {$t(kinds[e.kind] || e.kind)}</span
            >
            <span
              >{e.payload?.after?.title_np ||
                e.payload?.after?.title ||
                e.payload?.before?.title_np ||
                e.payload?.before?.title ||
                (e.payload?.count != null
                  ? `${e.payload.count} ${$t('Works')}`
                  : '')}</span
            >
            <time datetime={e.created_at}
              >{new Date(e.created_at).toLocaleString()}</time
            >
          </li>{/each}
      </ol>{/if}
  {/if}
</section>
<ArchiveList {data} admin />
<ConfirmDialog
  open={confirmAll}
  title="Delete all documents?"
  message="Every document, note, revision, and reading position will be permanently deleted. Download a backup first. Deleted content stays recorded in the archive ledger."
  {busy}
  onconfirm={confirmDeleteAll}
  oncancel={() => (confirmAll = false)}
/>
