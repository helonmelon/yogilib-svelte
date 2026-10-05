<script lang="ts">
  let { open = false, title, message, busy = false, onconfirm, oncancel } = $props<{
    open: boolean;
    title: string;
    message: string;
    busy?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }>();
</script>

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={oncancel}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div class="modal-actions">
        <button class="button" onclick={oncancel} disabled={busy}>Cancel</button>
        <button class="danger" onclick={onconfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </div>
  </div>
{/if}
