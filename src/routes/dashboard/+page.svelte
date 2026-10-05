<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/client/api';
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
<ArchiveList {data} admin />
<ConfirmDialog
  open={confirmAll}
  title="Delete all documents?"
  message="Every document, note, revision, and reading position will be permanently deleted."
  busy={busy}
  onconfirm={confirmDeleteAll}
  oncancel={() => (confirmAll = false)}
/>
