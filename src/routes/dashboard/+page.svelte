<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api, assetURL } from '$lib/client/api';
  import { t } from '$lib/i18n';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  let { data } = $props();
  let busy = $state(false);
  let error = $state('');
  let confirmAll = $state(false);
  let ledger = $state<
    | { ok: true; events: number; head: string }
    | { ok: false; events: number; brokenAt: string; reason: string }
    | null
  >(null);
  let checking = $state(false);
  async function verifyLedger() {
    checking = true;
    error = '';
    try {
      ledger = await api('ledger/verify');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      checking = false;
    }
  }
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
<section class="ledger-panel" aria-labelledby="ledger-title">
  <div>
    <h2 id="ledger-title">{$t('Archive ledger')}</h2>
    <p>{$t('Every change is recorded in a tamper-evident history.')}</p>
    {#if ledger?.ok}
      <p class="ledger-ok" role="status">
        ✓ {$t('Ledger intact')} · {ledger.events}
        {$t('events')} · <code>{ledger.head.slice(0, 12)}</code>
      </p>
    {:else if ledger}
      <p class="error" role="alert">
        {$t('Ledger broken')} · #{ledger.brokenAt}: {ledger.reason}
      </p>
    {/if}
  </div>
  <div class="ledger-actions">
    <button disabled={checking} onclick={verifyLedger}
      >{$t('Verify ledger')}</button
    >
    <a class="button" href={assetURL('/api/ledger/export')} download
      >{$t('Export ledger')}</a
    >
  </div>
</section>
<ArchiveList {data} admin />
<ConfirmDialog
  open={confirmAll}
  title="Delete all documents?"
  message="Every document, note, revision, and reading position will be deleted. Each document's final text stays in the archive ledger, but uploaded originals are removed permanently."
  {busy}
  onconfirm={confirmDeleteAll}
  oncancel={() => (confirmAll = false)}
/>
