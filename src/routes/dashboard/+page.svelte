<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/client/api';
  let { data } = $props();
  let busy = $state(false);
  let error = $state('');
  async function deleteAll() {
    if (!confirm('Delete every document permanently? This cannot be undone.')) return;
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
