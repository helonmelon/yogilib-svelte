<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/client/api';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import { onMount } from 'svelte';
  import { apiBase } from '$lib/client/api';
  import { t } from '$lib/i18n';
  let journal = $state<{
    ok: boolean;
    count: number;
    broken_at?: string;
  } | null>(null);
  onMount(async () => {
    try {
      journal = await api('archive/verify');
    } catch {}
  });
  let { data } = $props();
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

<div class="section-heading dashboard-actions">
  <div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if journal}
      <p class={journal.ok ? 'journal-ok' : 'error'} role="status">
        {journal.ok
          ? `${$t('Journal intact')} · ${journal.count} ${$t('entries')}`
          : `${$t('Journal broken at entry')} ${journal.broken_at}`}
      </p>
    {/if}
  </div>
  <a class="button quiet" href={apiBase + '/api/archive/export'} download
    >{$t('Export archive')}</a
  >
  <button class="danger" disabled={busy} onclick={deleteAll}>
    {busy ? 'Deleting…' : 'Delete all documents'}
  </button>
</div>
<ArchiveList {data} admin />
<ConfirmDialog
  open={confirmAll}
  title="Delete all documents?"
  message="Every document, note, revision, and reading position will be permanently deleted."
  {busy}
  onconfirm={confirmDeleteAll}
  oncancel={() => (confirmAll = false)}
/>

<style>
  .journal-ok {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted, #6b5a48);
  }
</style>
