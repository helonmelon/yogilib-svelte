<script lang="ts">
  import ArchiveList from '$lib/components/ArchiveList.svelte';
  import { goto } from '$app/navigation';
  import { api, assetURL } from '$lib/client/api';
  import { t } from '$lib/i18n';
  let records = $state<'activity' | 'payments' | null>(null);
  let rows = $state<any[]>([]);
  let recordError = $state('');
  async function show(kind: 'activity' | 'payments') {
    records = records === kind ? null : kind;
    rows = [];
    recordError = '';
    if (!records) return;
    try {
      rows = await api(kind === 'activity' ? 'admin/audit' : 'admin/payments');
    } catch (e) {
      recordError = (e as Error).message;
    }
  }
  const when = (v: string) => new Date(v).toLocaleString();
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
<section class="records card" aria-label={$t('Archive records')}>
  <div class="choice-row">
    <button aria-pressed={records === 'activity'} onclick={() => show('activity')}>{$t('Activity log')}</button>
    <button aria-pressed={records === 'payments'} onclick={() => show('payments')}>{$t('Contributions')}</button>
    <a class="button" href={assetURL('/api/admin/export')} download>{$t('Download archive backup (JSON)')}</a>
  </div>
  {#if recordError}<p class="error" role="alert">{recordError}</p>{/if}
  {#if records === 'activity'}<table>
      <thead><tr><th>{$t('When')}</th><th>{$t('Who')}</th><th>{$t('Action')}</th><th>{$t('Item')}</th></tr></thead>
      <tbody>
        {#each rows as r}<tr>
            <td>{when(r.created_at)}</td><td>{r.actor_email || '—'}</td><td>{r.action}</td><td
              >{r.target_type}{r.target_id ? ` #${r.target_id}` : ''}{r.detail?.title ? ` · ${r.detail.title}` : ''}</td
            >
          </tr>{:else}<tr><td colspan="4">{$t('Nothing recorded yet.')}</td></tr>{/each}
      </tbody>
    </table>{:else if records === 'payments'}<table>
      <thead><tr><th>{$t('When')}</th><th>{$t('Method')}</th><th>{$t('Amount')}</th><th>{$t('Status')}</th><th>{$t('Account')}</th></tr></thead>
      <tbody>
        {#each rows as r}<tr>
            <td>{when(r.created_at)}</td><td>{r.provider}</td><td>{r.currency} {r.amount_minor / 100}</td><td>{r.status}</td><td
              >{r.email || $t('Guest')}</td
            >
          </tr>{:else}<tr><td colspan="5">{$t('Nothing recorded yet.')}</td></tr>{/each}
      </tbody>
    </table>{/if}
</section>
<ArchiveList {data} admin />
<ConfirmDialog
  open={confirmAll}
  title="Delete all documents?"
  message="Every document, note, revision, and reading position will be permanently deleted."
  busy={busy}
  onconfirm={confirmDeleteAll}
  oncancel={() => (confirmAll = false)}
/>
