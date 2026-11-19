<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api, apiBase } from '$lib/client/api';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
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
  </div>
  <button class="danger" disabled={busy} onclick={deleteAll}>
    {busy ? 'Deleting…' : 'Delete all documents'}
  </button>
</div>
{#if data.ledger}
  {@const v = data.ledger.verification}
  <details class="ledger">
    <summary>
      <span>Archive ledger</span>
      {#if !v.enabled}
        <span class="ledger-state">Not enabled — apply migration 002-ledger</span>
      {:else if v.ok}
        <span class="ledger-state ok">Verified · {v.count} changes</span>
      {:else}
        <span class="ledger-state bad" role="alert">
          Integrity broken at change #{v.broken_at}
        </span>
      {/if}
    </summary>
    {#if v.enabled}
      <p class="count">
        Every archive change is appended to a hash-chained journal. Head
        <code>{v.head.slice(0, 12)}</code>.
        <a href={apiBase + '/api/ledger/export'} download>Export history (NDJSON)</a>
      </p>
      <ol class="ledger-events">
        {#each data.ledger.events as e (e.seq)}
          <li>
            <span class="count">#{e.seq} · {new Date(e.at).toLocaleString()}</span>
            <b>{e.kind}</b>
            {#if e.document_id}<a href={'/document/' + e.document_id}>{e.title || e.document_id}</a>{/if}
            {#if e.count !== undefined}<span>{e.count} documents</span>{/if}
          </li>
        {/each}
      </ol>
    {/if}
  </details>
{/if}
<ArchiveList {data} admin />
<ConfirmDialog
  open={confirmAll}
  title="Delete all documents?"
  message="Every document, note, revision, and reading position will be permanently deleted."
  busy={busy}
  onconfirm={confirmDeleteAll}
  oncancel={() => (confirmAll = false)}
/>
