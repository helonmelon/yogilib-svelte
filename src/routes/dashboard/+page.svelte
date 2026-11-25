<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api, apiBase } from '$lib/client/api';
  import { t } from '$lib/i18n';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  let { data } = $props();
  let busy = $state(false);
  let error = $state('');
  let confirmAll = $state(false);
  let exporting = $state(false);
  async function downloadCapsule() {
    exporting = true;
    error = '';
    try {
      const r = await fetch(apiBase + '/api/capsule', {
        credentials: 'include',
      });
      if (!r.ok)
        throw new Error(
          (await r.json().catch(() => ({}))).error || 'Export failed',
        );
      const name =
        /filename="([^"]+)"/.exec(
          r.headers.get('content-disposition') || '',
        )?.[1] || 'yogilib-capsule.json';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await r.blob());
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = false;
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
  <button
    disabled={exporting}
    onclick={downloadCapsule}
    title={$t(
      'A verifiable copy of every document and revision, without accounts or private notes.',
    )}
  >
    {exporting ? $t('Preparing…') : $t('Download time capsule')}
  </button>
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
