<script lang="ts">
  import { t } from '$lib/i18n';
  import { api } from '$lib/client/api';
  type Entry = {
    seq: string;
    at: string;
    kind: string;
    document_id: string;
    actor: string;
    title: string;
    hash: string;
  };
  type Check = {
    enabled: boolean;
    ok: boolean;
    count: number;
    head: string;
    brokenAt: string | null;
    drift: string[];
  };
  let open = $state(false);
  let busy = $state(false);
  let error = $state('');
  let check = $state<Check | null>(null);
  let entries = $state<Entry[]>([]);
  const labels: Record<string, string> = {
    'document.snapshot': 'Recorded',
    'document.create': 'Added',
    'document.update': 'Edited',
    'document.restore': 'Restored',
    'document.delete': 'Deleted',
    'archive.delete_all': 'Deleted all documents',
  };
  async function load() {
    busy = true;
    error = '';
    try {
      [check, entries] = await Promise.all([
        api('chronicle/verify'),
        api('chronicle').then((r: { entries: Entry[] }) => r.entries),
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
  async function seal() {
    busy = true;
    try {
      await api('chronicle/seal', { method: 'POST', body: '{}' });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await load();
  }
  function toggle(e: Event) {
    open = (e.currentTarget as HTMLDetailsElement).open;
    if (open && !check) load();
  }
</script>

<details class="chronicle" ontoggle={toggle}>
  <summary>{$t('Archive chronicle')}</summary>
  <p class="muted">
    {$t(
      'Every change is written to an append-only log. Each entry is sealed with the hash of the one before it, and deleted text stays in the log.',
    )}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if busy && !check}<p class="muted">{$t('Loading…')}</p>{/if}
  {#if check}
    {#if !check.enabled}
      <p class="error">
        {$t('The chronicle migration has not been applied to this database.')}
      </p>
    {:else}
      <p class={check.ok ? 'chronicle-ok' : 'error'} role="status">
        {#if check.ok}
          {$t('Verified')} · {check.count} {$t('entries')}
        {:else if check.brokenAt}
          {$t('History does not verify from entry')} {check.brokenAt}
        {:else}
          {$t('Documents not matching the chronicle')}: {check.drift.join(', ')}
        {/if}
      </p>
      <p class="muted chronicle-head" title={check.head}>
        {$t('Head')}: <code>{check.head.slice(0, 16)}</code>
      </p>
      <div class="chronicle-actions">
        <button disabled={busy} onclick={load}>{$t('Verify again')}</button>
        {#if check.drift.length && !check.brokenAt}
          <button disabled={busy} onclick={seal}
            >{$t('Record unrecorded documents')}</button
          >
        {/if}
      </div>
      <ol class="chronicle-list">
        {#each entries as e (e.seq)}
          <li>
            <span class="muted">#{e.seq}</span>
            <strong>{$t(labels[e.kind] || e.kind)}</strong>
            {#if e.document_id && e.kind !== 'document.delete'}
              <a href={'/document/' + e.document_id}
                >{e.title || e.document_id}</a
              >
            {:else if e.title}
              <span>{e.title}</span>
            {/if}
            <span class="muted"
              >{new Date(e.at).toLocaleString()}{e.actor
                ? ' · ' + e.actor
                : ''}</span
            >
          </li>
        {/each}
      </ol>
    {/if}
  {/if}
</details>
